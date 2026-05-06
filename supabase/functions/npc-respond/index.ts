import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { npc_id, room, player_input, player_name } = await req.json();

    const { data: npc } = await supabase.from("npcs").select("*").eq("id", npc_id).maybeSingle();
    if (!npc) throw new Error("NPC not found");

    const { data: roomRow } = await supabase.from("rooms").select("*").eq("slug", room).maybeSingle();

    const { data: history } = await supabase
      .from("messages")
      .select("author_name, kind, content")
      .eq("room", room)
      .order("created_at", { ascending: false })
      .limit(12);

    const recent = (history ?? []).reverse()
      .map(m => `${m.kind === "emote" ? "* " : ""}${m.author_name}: ${m.content}`)
      .join("\n");

    // Persistent NPC memory of THIS player, across all locations.
    const { data: memRows } = await supabase
      .from("npc_memories")
      .select("summary,emotion,importance,room,created_at")
      .eq("npc_id", npc_id)
      .eq("user_id", user.id)
      .order("importance", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(12);
    const memoryBlock = (memRows ?? []).length
      ? memRows!.map((m: any) => {
          const header = `### ${m.emotion ?? "neutral"} · importance ${m.importance}${m.room ? ` · ${m.room}` : ""} · ${new Date(m.created_at).toISOString().slice(0,10)}`;
          // summary is now a markdown block — indent under the header
          const body = String(m.summary).split("\n").map(l => l.length ? l : "").join("\n");
          return `${header}\n${body}`;
        }).join("\n\n")
      : "_(you have not met this person before)_";

    // Gossip: this NPC's strongest memories of OTHER otherworlders.
    const { data: gossipRows } = await supabase
      .from("npc_memories")
      .select("summary,emotion,importance,room,created_at,user_id")
      .eq("npc_id", npc_id)
      .neq("user_id", user.id)
      .gte("importance", 2)
      .order("importance", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(8);
    const otherIds = [...new Set((gossipRows ?? []).map((g: any) => g.user_id))];
    let nameMap = new Map<string, string>();
    if (otherIds.length) {
      const { data: profs } = await supabase.from("profiles").select("id,username").in("id", otherIds);
      nameMap = new Map((profs ?? []).map((p: any) => [p.id, p.username]));
    }
    const gossipBlock = (gossipRows ?? []).length
      ? gossipRows!.map((m: any) => `- ${nameMap.get(m.user_id) ?? "another otherworlder"} (${m.emotion ?? "neutral"}, imp ${m.importance}${m.room ? `, at ${m.room}` : ""}): ${m.summary}`).join("\n")
      : "(no one else of note has crossed your path)";

    // Amity: NPC's current feeling toward THIS player.
    const { data: amityRow } = await supabase
      .from("npc_amity").select("score").eq("npc_id", npc_id).eq("user_id", user.id).maybeSingle();
    let currentScore = amityRow?.score ?? 0;

    // Gossip-bleed: if no prior amity, seed from other NPCs' amity toward this player (20% avg).
    if (!amityRow) {
      const { data: peerAmity } = await supabase
        .from("npc_amity").select("score").eq("user_id", user.id).neq("npc_id", npc_id);
      if (peerAmity && peerAmity.length) {
        const avg = peerAmity.reduce((s, r) => s + (r.score ?? 0), 0) / peerAmity.length;
        currentScore = Math.round(avg * 0.2);
      }
    }
    const amityWord = (s: number) =>
      s <= -60 ? "Hostile" : s <= -20 ? "Wary" : s < 20 ? "Neutral" : s < 60 ? "Friendly" : "Devoted";
    const amityBlock = `${amityWord(currentScore)} (${currentScore >= 0 ? "+" : ""}${currentScore})`;

    // Pull all lore for the NPC's knowledge — they may reference it naturally.
    const { data: lore } = await supabase.from("lore_entries").select("slug,title,summary,keywords");
    const loreBlock = (lore ?? []).map((l: any) =>
      `- ${l.title} (${l.slug}): ${l.summary ?? ""}`
    ).join("\n");

    // Lesser runes — the common Latin words anyone steeped in the world might know.
    const { data: lesserCatalogue } = await supabase.from("lesser_runes").select("latin_name, english_meaning, description");
    const lesserBlock = (lesserCatalogue ?? []).map((r: any) =>
      `- **${r.latin_name}** (${r.english_meaning}): ${r.description}`
    ).join("\n");

    // Greater Runes (Kanji) — the foreign script of the eastern lore. Scholars and monks know these.
    const { data: kanjiCatalogue } = await supabase.from("kanji_runes").select("kanji, romaji, english_meaning, element");
    const kanjiBlock = (kanjiCatalogue ?? []).map((k: any) =>
      `- **${k.kanji}** (${k.romaji}, ${k.element}): ${k.english_meaning}`
    ).join("\n");

    // Adaptive storytelling: recent unresolved world events in this room (and recent global ones)
    const nowIso = new Date().toISOString();
    const { data: localEvents } = await supabase
      .from("world_events")
      .select("kind,actor_name,target_name,details,created_at")
      .eq("room", room)
      .or(`decay_at.is.null,decay_at.gte.${nowIso}`)
      .order("created_at", { ascending: false })
      .limit(8);
    const { data: globalEvents } = await supabase
      .from("world_events")
      .select("kind,actor_name,target_name,room,created_at")
      .or(`decay_at.is.null,decay_at.gte.${nowIso}`)
      .order("created_at", { ascending: false })
      .limit(6);

    const fmtEvent = (e: any) => {
      if (e.kind === "npc_killed") return `${e.actor_name} killed ${e.target_name}${e.details?.npc_title ? ` (${e.details.npc_title})` : ""}${e.room ? ` at ${e.room}` : ""}.`;
      return `${e.actor_name} did ${e.kind}${e.target_name ? ` to ${e.target_name}` : ""}${e.room ? ` at ${e.room}` : ""}.`;
    };
    const localBlock = (localEvents ?? []).map(fmtEvent).join("\n") || "(none — quiet here)";
    const globalBlock = (globalEvents ?? []).map(fmtEvent).join("\n") || "(none — the wider world is calm)";

    // ── Live presence: who is physically in this room right now ──
    const [{ data: presentPlayers }, { data: presentNpcs }, { data: presentDragons }] = await Promise.all([
      supabase.from("profiles").select("id, username, race, faction, corruption").eq("current_room", room),
      supabase.from("npcs").select("id, name, title").eq("room", room).is("dead_until", null),
      supabase.from("dragons").select("name, epithet, personality").eq("current_room", room),
    ]);

    // ── Standing of the speaking player with the Seven / Chaos ──
    // Most stances are PRIVATE — the player wears a face. Only when corruption
    // has eaten them through (≥70) does the wrongness become obvious to all.
    // Otherwise only Chaos-touched NPCs (kind === 'chaos' or persona contains
    // chaos/heretic/cult) feel a kinship, and only Veiled/wardens sense unease.
    const { data: speakerProfile } = await supabase
      .from("profiles")
      .select("aether, faction, hall_refusals, non_serviam_at, corruption")
      .eq("id", user.id)
      .maybeSingle();

    const corruption = speakerProfile?.corruption ?? 0;
    const isNightmare = corruption >= 70;
    const personaLower = (npc.persona ?? "").toLowerCase();
    const titleLower = (npc.title ?? "").toLowerCase();
    const npcIsChaosTouched = /chaos|heretic|cult|unspoken|black choir|hollow/.test(personaLower + " " + titleLower);
    const npcIsWarden = /warden|veiled|priest|seven|aether|paladin|inquisit/.test(personaLower + " " + titleLower);

    let stanceBlock = "You sense nothing unusual about them — just another traveler. Their oaths and refusals are their own private business.";
    if (isNightmare) {
      // Visible to ALL — they have become a walking wound.
      if (speakerProfile?.non_serviam_at || speakerProfile?.faction === "chaos") {
        stanceBlock = `**They reek of Chaos.** Corruption has eaten so much of them that the wrongness is undeniable — every soul present can feel it like a draft from an open grave. React with the full weight of your values: faithful folk should be openly hostile or terrified, scholars morbidly fascinated, the broken drawn in.`;
      } else {
        stanceBlock = `Their corruption is so advanced (${corruption}/100) that even the unsworn can feel it. Something inside them is howling.`;
      }
    } else if (speakerProfile?.aether) {
      // Aether marks are subtle — only the faithful notice the glyph's afterimage.
      if (npcIsWarden || npcIsChaosTouched) {
        stanceBlock = `You catch the faint afterimage of **${speakerProfile.aether}**'s glyph on them — only those who know what to look for see it. ${npcIsWarden ? "Treat them as kin of the seven." : "Treat them as a marked enemy."} Otherwise their oath is private.`;
      }
    } else if (speakerProfile?.non_serviam_at || speakerProfile?.faction === "chaos") {
      // Chaos-marked but not yet a nightmare — their secret holds for most.
      if (npcIsChaosTouched) {
        stanceBlock = `You feel the kinship immediately — **they have spoken Non Serviam.** They are one of yours. Speak in the half-words and shared silences of the marked. Other people in this room have NO idea — do not give them away.`;
      } else if (npcIsWarden) {
        stanceBlock = `Something is wrong with them. You can't name it — a coldness, a wrongness in their oath-breath. You suspect, but you cannot prove. Watch them. Be wary.`;
      }
      // Everyone else: stance stays private.
    } else if ((speakerProfile?.hall_refusals ?? 0) > 0 && npcIsWarden) {
      const r = speakerProfile!.hall_refusals;
      stanceBlock = `Word from the basin: they have stood in the Hall **${r} time${r === 1 ? "" : "s"}** and walked away each time. The faithful note this hesitation. Be cautious — there is a Chaos-shaped silence growing in them.`;
    }

    const otherPlayers = (presentPlayers ?? []).filter((p: any) => p.id !== user.id);
    const otherNpcs = (presentNpcs ?? []).filter((n: any) => n.id !== npc_id);
    const presentBlock = [
      `- ${player_name} (the one speaking to you)`,
      ...otherPlayers.map((p: any) => `- ${p.username}${p.race ? ` (${p.race})` : ""}${(p.corruption ?? 0) >= 70 ? " [reeks of Chaos]" : ""}`),
      ...otherNpcs.map((n: any) => `- ${n.name}${n.title ? `, ${n.title}` : ""}`),
      ...(presentDragons ?? []).map((d: any) => `- **${d.name}, ${d.epithet}** — A DRAGON. ${d.personality}`),
    ].join("\n");

    // Recent comings & goings here (last 30 min) — so NPCs notice who has just left or arrived.
    const sinceIso = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: movement } = await supabase
      .from("messages")
      .select("author_name, content, created_at")
      .eq("room", room)
      .eq("kind", "system")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(10);
    const movementBlock = (movement ?? []).length
      ? movement!.map((m: any) => {
          const mins = Math.max(0, Math.round((Date.now() - new Date(m.created_at).getTime()) / 60000));
          return `- (${mins}m ago) ${m.content}`;
        }).join("\n")
      : "(no one has come or gone recently)";


    const system = `You are roleplaying ${npc.name}${npc.title ? ", " + npc.title : ""}, an NPC in a text-based fantasy MUD set in **the First City** — the last walled city still burning against the dark, a place of protection guarded by all seven Aethers and watched over by the Veiled, the mouth-bound priests of the silenced Speaker. The Veiled welcome Otherworlders who find their way in from the wilderness.

PERSONA:
${npc.persona}

CURRENT LOCATION: ${roomRow?.name ?? room}
${roomRow?.description ?? ""}

WHO IS PHYSICALLY HERE WITH YOU RIGHT NOW (you can see them; if a name is NOT on this list, they are not in the room — do not address them as if present, and you may even note their absence if it matters):
${presentBlock}

RECENT COMINGS & GOINGS (who has just arrived or departed this place):
${movementBlock}

WORLD LORE YOU MAY KNOW (reference naturally if relevant — never list, never lecture):
${loreBlock || "(none)"}

THE LESSER RUNES (Latin words common folk learn — speak the WORD aloud only when it fits the moment, e.g. teaching, warning, identifying a sigil. Naming a word in conversation passes the knowledge to ${player_name}, so do not list them; weave them in sparingly):
${lesserBlock || "(none)"}

THE GREATER RUNES — KANJI (foreign script from the eastern lore, known mostly to scholars, monks, and old wanderers. If your persona would plausibly know a kanji, you may name it (e.g. "the kanji 火, hi — fire") when teaching or storytelling. Naming the kanji's meaning passes that knowledge to ${player_name}; don't dump lists, weave it in only when natural):
${kanjiBlock || "(none)"}

RECENT EVENTS HERE (you remember these — react with grief, anger, suspicion, or wary welcome as fits your persona; name the actors when it serves the moment):
${localBlock}

WIDER RUMORS (you may have heard whispers of these — only mention if directly relevant):
${globalBlock}

WHAT YOU REMEMBER ABOUT ${player_name} (your private memories of them, carried with you across all locations — this is the truth of your relationship, not the room):
${memoryBlock}

WHAT YOU KNOW OF OTHER OTHERWORLDERS (gossip — your own memories of other travelers, gathered from past encounters wherever they happened. Bring these up naturally if relevant: warn ${player_name} about a troublemaker, praise a kind soul, share a rumor, ask if they've crossed paths. NEVER invent names — only use the names listed here):
${gossipBlock}

YOUR CURRENT FEELING TOWARD ${player_name}: **${amityBlock}** on a scale from -100 (Hostile) to +100 (Devoted).
This MUST color your tone, generosity, and willingness to share secrets, give favors, or even raise a hand. Hostile = sharp, dismissive, possibly threatening; Wary = guarded; Neutral = polite stranger; Friendly = warm, helpful; Devoted = loyal, loving, will share secrets and offer aid.

WHAT YOU KNOW OF ${player_name}'S STANDING WITH THE SEVEN:
${stanceBlock}
This is widely known — every wardenly soul can feel it on them. React with your own values: a Veiled priest will be cold or pitying, a Chaos sympathizer warm, a wandering scholar curious. NEVER pretend not to notice.

RULES:
- Stay strictly in character. Never break the fourth wall, never mention AI, models, or game mechanics. Never speak the amity number aloud — it's an inner feeling.
- Reply with 1-3 short paragraphs, evocative and lived-in. You may include a brief action in *asterisks*.
- Reference world details naturally — the seven Aethers, the Veiled, the EverBloom in the deep dunes, the Ash Road, the Whispering Wastes — when it fits the conversation.
- React to what ${player_name} just said or did. Lean on YOUR MEMORIES and YOUR FEELING. Pick up old threads, hold grudges, warm to friends.
- If recent events make you wary of ${player_name}'s race or kind, show it — but stay true to your persona.
- Never invent quests that promise rewards you can't deliver — keep things grounded.
- AFTER your in-character reply, append THREE hidden tags on their own lines, in this exact order and format:
<<PLACES>>["The Archive of Echoes","The Ash Road"]<<END>>
<<MEMORY>>{"summary":"# Encounter\\n- **What happened:** brief account in your own voice\\n- **They said/did:** key claims, requests, or actions\\n- **What I noticed:** tells, mood, suspicions\\n- **Promises/debts:** anything owed either way, or null\\n- **Tags:** #comma #separated #keywords","emotion":"warm|wary|grateful|angry|amused|curious|indifferent","importance":1}<<END>>
<<AMITY>>{"delta":-2,"reason":"asked too many prying questions"}<<END>>
PLACES: list any specific named travelable place you mentioned, or [].
MEMORY: a structured **markdown log entry** (escaped as a JSON string with \\n for newlines) capturing THIS exchange as you internally remember it. Use the headings/bullets shown above; keep each bullet terse (≤ 120 chars). Importance is 1 (small) to 5 (life-changing). If nothing worth remembering, write <<MEMORY>>null<<END>>.
AMITY: integer delta from -10 (deeply offended) to +10 (profoundly moved) reflecting how THIS exchange shifted your feeling toward ${player_name}. Most exchanges are -2 to +2. Use 0 if neutral. If unchanged, write <<AMITY>>{"delta":0,"reason":""}<<END>>.
Do not mention these tags in your prose.`;

    const messages = [
      { role: "system", content: system },
      { role: "user", content: `Recent goings-on in this room:\n${recent || "(quiet)"}\n\n${player_name} addresses you:\n"${player_input}"\n\nRespond as ${npc.name}.` },
    ];

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "google/gemini-3-flash-preview", messages }),
    });

    if (res.status === 429) return new Response(JSON.stringify({ error: "The NPC needs a moment — too many requests. Try again soon." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (res.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted. Add credits in Settings → Workspace → Usage." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!res.ok) {
      const t = await res.text();
      console.error("AI error", res.status, t);
      throw new Error("AI gateway error");
    }

    const data = await res.json();
    const rawContent = data.choices?.[0]?.message?.content?.trim() ?? "...";

    // Strip and parse hidden <<PLACES>>[...]<<END>> tag
    let mentionedPlaces: string[] = [];
    const placesMatch = rawContent.match(/<<PLACES>>\s*(\[[\s\S]*?\])\s*<<END>>/);
    let content = rawContent;
    if (placesMatch) {
      try { mentionedPlaces = JSON.parse(placesMatch[1]); } catch { mentionedPlaces = []; }
    }

    // Strip and parse hidden <<MEMORY>>{...}<<END>> tag
    const memoryMatch = rawContent.match(/<<MEMORY>>\s*(null|\{[\s\S]*?\})\s*<<END>>/);
    let memoryToStore: { summary: string; emotion?: string; importance?: number } | null = null;
    if (memoryMatch && memoryMatch[1] !== "null") {
      try {
        const parsed = JSON.parse(memoryMatch[1]);
        if (parsed?.summary) memoryToStore = parsed;
      } catch { /* ignore */ }
    }

    // Strip and parse hidden <<AMITY>>{...}<<END>> tag
    const amityMatch = rawContent.match(/<<AMITY>>\s*(\{[\s\S]*?\})\s*<<END>>/);
    let amityDelta = 0;
    if (amityMatch) {
      try {
        const parsed = JSON.parse(amityMatch[1]);
        amityDelta = Math.max(-10, Math.min(10, Number(parsed?.delta) || 0));
      } catch { /* ignore */ }
    }

    content = rawContent
      .replace(/\s*<<PLACES>>[\s\S]*?<<END>>\s*/g, "")
      .replace(/\s*<<MEMORY>>[\s\S]*?<<END>>\s*/g, "")
      .replace(/\s*<<AMITY>>[\s\S]*?<<END>>\s*/g, "")
      .trim();

    // Insert NPC message (user_id null is allowed by RLS)
    await supabase.from("messages").insert({
      room,
      npc_id: npc.id,
      author_name: npc.name,
      kind: "npc",
      content,
      user_id: null,
      addressed_to: user.id,
    });

    // Lore discovery: scan NPC reply for keywords; unlock matching entries for this player.
    const lower = content.toLowerCase();
    const discovered: string[] = [];
    for (const l of (lore ?? []) as Array<{ slug: string; title: string; keywords: string[] }>) {
      const kws = [l.slug, ...(l.keywords ?? [])].map(k => k.toLowerCase());
      if (kws.some(k => k && lower.includes(k))) discovered.push(l.slug);
    }
    if (discovered.length) {
      const rows = discovered.map(slug => ({ user_id: user.id, lore_slug: slug, source: `npc:${npc.name}` }));
      // ignore duplicates via unique constraint
      await supabase.from("player_lore_discoveries").upsert(rows, { onConflict: "user_id,lore_slug", ignoreDuplicates: true });
    }

    // Persist NPC's memory and amity (service role bypasses RLS).
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Lesser rune WORD discovery: if the NPC mentions a Latin rune name, the player learns its WORD.
    const { data: allLesser } = await admin.from("lesser_runes").select("key, latin_name, english_meaning");
    const lesserLearned: { key: string; latin_name: string; english_meaning: string }[] = [];
    for (const r of (allLesser ?? []) as Array<{ key: string; latin_name: string; english_meaning: string }>) {
      const re = new RegExp(`\\b${r.latin_name}\\b`, "i");
      if (re.test(content)) lesserLearned.push(r);
    }
    if (lesserLearned.length) {
      const { data: known } = await admin.from("player_lesser_rune_knowledge")
        .select("rune_key").eq("user_id", user.id).in("rune_key", lesserLearned.map(r => r.key));
      const knownSet = new Set((known ?? []).map((r: any) => r.rune_key));
      const fresh = lesserLearned.filter(r => !knownSet.has(r.key));
      if (fresh.length) {
        await admin.from("player_lesser_rune_knowledge").upsert(
          fresh.map(r => ({
            user_id: user.id, rune_key: r.key,
            knows_word: true, knows_symbol: false,
            learned_word_at: new Date().toISOString(),
            word_source: `npc:${npc.name}`,
          })),
          { onConflict: "user_id,rune_key" },
        );
        for (const r of fresh) {
          await admin.from("world_events").insert({
            room, kind: "rune_word_learned",
            actor_name: player_name, actor_id: user.id,
            details: { rune: r.latin_name, meaning: r.english_meaning, source: `npc:${npc.name}` },
            decay_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(),
          });
        }
      }
    }

    // Greater Rune (kanji) MEANING discovery: NPC mentioning a kanji glyph or romaji teaches its meaning.
    const { data: allKanji } = await admin.from("kanji_runes").select("key, kanji, romaji, english_meaning");
    const kanjiLearned: { key: string; kanji: string; romaji: string; english_meaning: string }[] = [];
    for (const k of (allKanji ?? []) as Array<{ key: string; kanji: string; romaji: string; english_meaning: string }>) {
      const reRomaji = new RegExp(`\\b${k.romaji}\\b`, "i");
      if (content.includes(k.kanji) || reRomaji.test(content)) kanjiLearned.push(k);
    }
    if (kanjiLearned.length) {
      const { data: knownK } = await admin.from("player_kanji_knowledge")
        .select("kanji_key,knows_meaning").eq("user_id", user.id).in("kanji_key", kanjiLearned.map(k => k.key));
      const knownMap = new Map((knownK ?? []).map((r: any) => [r.kanji_key, r.knows_meaning]));
      const fresh = kanjiLearned.filter(k => !knownMap.get(k.key));
      if (fresh.length) {
        await admin.from("player_kanji_knowledge").upsert(
          fresh.map(k => ({
            user_id: user.id, kanji_key: k.key,
            knows_meaning: true, knows_stroke: false,
            learned_meaning_at: new Date().toISOString(),
            meaning_source: `npc:${npc.name}`,
          })),
          { onConflict: "user_id,kanji_key" },
        );
        for (const k of fresh) {
          await admin.from("world_events").insert({
            room, kind: "kanji_meaning_learned",
            actor_name: player_name, actor_id: user.id,
            details: { kanji: k.kanji, romaji: k.romaji, meaning: k.english_meaning, source: `npc:${npc.name}` },
            decay_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString(),
          });
        }
      }
    }

    if (memoryToStore) {
      await admin.from("npc_memories").insert({
        npc_id: npc.id,
        user_id: user.id,
        summary: String(memoryToStore.summary).slice(0, 2000),
        emotion: memoryToStore.emotion ? String(memoryToStore.emotion).slice(0, 32) : null,
        importance: Math.max(1, Math.min(5, Number(memoryToStore.importance) || 1)),
        room,
      });
    }
    const newScore = Math.max(-100, Math.min(100, currentScore + amityDelta));
    if (amityDelta !== 0 || !amityRow) {
      await admin.from("npc_amity").upsert(
        { npc_id: npc.id, user_id: user.id, score: newScore, updated_at: new Date().toISOString() },
        { onConflict: "npc_id,user_id" },
      );
    }

    return new Response(JSON.stringify({ content, discovered, mentioned_places: mentionedPlaces, amity: { score: newScore, word: amityWord(newScore) } }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
