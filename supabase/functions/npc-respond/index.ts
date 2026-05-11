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

    // Soul gate: dead can only be heard by those bound to the required rune (Necros).
    if ((npc as any).requires_rune_key) {
      const { data: knows } = await supabase.from("player_lesser_rune_knowledge")
        .select("rune_key").eq("user_id", user.id).eq("rune_key", (npc as any).requires_rune_key)
        .eq("knows_word", true).eq("knows_symbol", true).maybeSingle();
      if (!knows) {
        return new Response(JSON.stringify({
          content: `*${npc.name} is moving their lips, but no sound reaches you. Without the Blessing of Necros, the dead are silent.*`,
          silent: true,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

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

    // ── Speaker's Artifacts: surface oblique rumors only when the player asks the right questions ──
    const inputLower = String(player_input || "").toLowerCase();
    const rumorTriggerRe = /\b(relic|relics|artifact|artifacts|speaker|silenced|hidden|lost|sacred|holy|treasure|forbidden|shrine|reliqu|word of power|first city.*relic|veil|tongue|seal|crown|chalice|mirror|key|bell|shard|ember|coin|veil|veil|cup|stone|tablet|sigil|mask|ring|horn|lantern)\b/;
    let artifactWhispers: Array<{ key: string; name: string; glyph: string; blurb: string; lore: string; holder_kind: string; home_room: string }> = [];
    let alreadyHeardKeys: string[] = [];
    if (rumorTriggerRe.test(inputLower)) {
      const { data: allArt } = await supabase.from("speaker_artifacts")
        .select("key,name,glyph,blurb,lore,holder_kind,home_room");
      const { data: heard } = await supabase.from("player_artifact_rumors")
        .select("artifact_key").eq("user_id", user.id);
      alreadyHeardKeys = (heard ?? []).map((h: any) => h.artifact_key);
      const heardSet = new Set(alreadyHeardKeys);

      // Score artifacts: name match in input > holder/home overlap with this NPC > random
      const persona = (npc.persona ?? "") + " " + (npc.title ?? "");
      const personaLow = persona.toLowerCase();
      const scored = (allArt ?? []).map((a: any) => {
        let score = 0;
        const nameWords = a.name.toLowerCase().replace(/^the\s+/, "").split(/\s+/);
        for (const w of nameWords) if (w.length > 3 && inputLower.includes(w)) score += 5;
        if (a.home_room === room) score += 3;
        if (a.holder_kind === "veiled" && /veiled|priest|silent/.test(personaLow)) score += 2;
        if (a.holder_kind === "aether" && /aether|warden|seven|throne/.test(personaLow)) score += 2;
        if (a.holder_kind === "wild" && /hermit|wanderer|drunk|scavenger|ranger|nomad/.test(personaLow)) score += 2;
        if (heardSet.has(a.key)) score -= 3; // prefer fresh rumors
        score += Math.random() * 0.5;
        return { a, score };
      }).sort((x, y) => y.score - x.score).slice(0, 3);
      artifactWhispers = scored.filter(s => s.score > -2).map(s => s.a);
    }
    const artifactBlock = artifactWhispers.length
      ? artifactWhispers.map((a) => {
          const where = a.holder_kind === "aether" ? `held by an Aether at ${a.home_room}`
            : a.holder_kind === "veiled" ? `kept by the Veiled near ${a.home_room}`
            : `lost somewhere out by ${a.home_room}`;
          const fresh = alreadyHeardKeys.includes(a.key) ? " (player already heard a half-rumor of this — vary it, do not repeat verbatim)" : "";
          return `- ${a.glyph} **${a.name}** — ${where}. Lore: ${a.lore} Whisper: ${a.blurb}${fresh}`;
        }).join("\n")
      : "";

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

    // ── Active and just-offered quests between THIS NPC and THIS player ──
    const { data: questsWithGiver } = await supabase.from("quests")
      .select("id, title, objective, status, severity, kind")
      .eq("user_id", user.id).eq("giver_npc_id", npc_id)
      .in("status", ["offered", "active"]);
    const activeQuest = (questsWithGiver ?? []).find((q: any) => q.status === "active");
    const pendingOffer = (questsWithGiver ?? []).find((q: any) => q.status === "offered");
    const questBlock = activeQuest
      ? `ACTIVE QUEST WITH ${player_name}: "${activeQuest.title}" (${activeQuest.severity} ${activeQuest.kind}) — ${activeQuest.objective}\nQUEST_ID: ${activeQuest.id}\nIf they have completed it, emit a <<QUEST_RESOLVE>> tag (see below). Otherwise reference the quest naturally — encourage, taunt, hint.`
      : pendingOffer
      ? `(You have already offered "${pendingOffer.title}" but they haven't yet accepted. Do not offer another quest.)`
      : `(No active quests with this player. You MAY offer one if a need arises naturally — but only ONE per reply, and only if it fits the moment.)`;

    // ── Services this NPC sells, and any active personal price-offers for THIS player ──
    const { data: npcServices } = await supabase.from("npc_services")
      .select("key, name, blurb, kind, price_gold").eq("npc_id", npc_id);
    const { data: liveOffers } = await supabase.from("npc_service_offers")
      .select("service_key, price_gold, expires_at")
      .eq("npc_id", npc_id).eq("user_id", user.id)
      .is("used_at", null).gt("expires_at", new Date().toISOString());
    const offerByKey = new Map<string, number>();
    for (const o of (liveOffers ?? [])) offerByKey.set(o.service_key, o.price_gold);
    const servicesBlock = (npcServices ?? []).length
      ? (npcServices ?? []).map((s: any) => {
          const cur = offerByKey.get(s.key);
          const priceLine = cur != null && cur < s.price_gold
            ? `list ${s.price_gold}g, your standing offer to them: **${cur}g**`
            : `${s.price_gold}g`;
          return `- key:${s.key} | "${s.name}" — ${priceLine} — ${s.blurb}`;
        }).join("\n")
      : "(you sell no formal services)";

    // ── Item-for-sale context: surface candidate items when player input mentions item words,
    //    plus any active personal item offers from this NPC to this player. ──
    const itemWords = inputLower.match(/[a-z][a-z\-]{2,}/g) ?? [];
    const itemSearchTerms = [...new Set(itemWords.filter(w => w.length >= 4))].slice(0, 8);
    let itemCandidates: Array<{ key: string; name: string; slot: string; value: number; description: string }> = [];
    if (itemSearchTerms.length) {
      const orParts = itemSearchTerms.flatMap(w => [`name.ilike.%${w}%`, `key.ilike.%${w}%`]).join(",");
      const { data: hits } = await supabase.from("items")
        .select("key,name,slot,value,description").or(orParts).limit(20);
      itemCandidates = hits ?? [];
    }
    const { data: liveItemOffers } = await supabase.from("npc_item_offers")
      .select("item_key, price_gold, expires_at")
      .eq("npc_id", npc_id).eq("user_id", user.id)
      .is("used_at", null).gt("expires_at", new Date().toISOString());
    const itemOfferMap = new Map<string, number>();
    for (const o of (liveItemOffers ?? [])) itemOfferMap.set(o.item_key, o.price_gold);
    const itemContextBlock = itemCandidates.length
      ? itemCandidates.map((it: any) => {
          const cur = itemOfferMap.get(it.key);
          const priceLine = cur != null ? `your standing offer to them: **${cur}g** (catalog value ${it.value}g)` : `catalog value ${it.value}g`;
          return `- key:${it.key} | "${it.name}" (${it.slot}) — ${priceLine} — ${it.description}`;
        }).join("\n")
      : "(no specific items in mind right now)";
    const standingItemOffersBlock = (liveItemOffers ?? []).length
      ? (liveItemOffers ?? []).map((o: any) => `- ${o.item_key} for **${o.price_gold}g** (good until ${new Date(o.expires_at).toISOString().slice(11,16)} UTC)`).join("\n")
      : "(none right now)";

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


    // ── Per-reply style roll: keep conversation from feeling formulaic ──
    const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
    const lengthBeat = pick([
      { name: "CLIPPED", desc: "A single line. Maybe a fragment. No more than 18 words. Let silence do the rest." },
      { name: "TERSE", desc: "Two short sentences. No paragraph break. Like a soldier who hates wasting breath." },
      { name: "ONE BEAT", desc: "A single tight paragraph (2-4 sentences). One vivid image, one feeling." },
      { name: "ONE BEAT", desc: "A single tight paragraph (2-4 sentences). One vivid image, one feeling." },
      { name: "TWO BEATS", desc: "Two short paragraphs. The first reacts; the second reveals or asks." },
      { name: "RAMBLING", desc: "Three short paragraphs that drift — answer sideways, mention something unrelated, circle back." },
      { name: "INTERRUPTED", desc: "Start one thought, break off mid-sentence with — , then say something else entirely." },
    ]);
    const openingBeat = pick([
      "Open with a small physical action in *asterisks* before any words.",
      "Open with a question fired back at them, no preamble.",
      "Open mid-thought, as if continuing something they didn't hear you start.",
      "Open with a single word — a name, a curse, a greeting — then a beat, then the rest.",
      "Open with a fragment of a saying, song, prayer, or proverb from your culture.",
      "No greeting. No preamble. Just the answer or the deflection.",
      "Open by ignoring what they said and commenting on something else — the weather, their boots, a sound outside.",
      "Open with a long, quiet pause described in *asterisks*.",
    ]);
    const flavorBeat = pick([
      "Use a sensory detail nobody asked about (a smell, a draft, a distant bell, the taste of the air).",
      "Slip in one piece of personal history — a scar, a name, a year, a regret — even if irrelevant.",
      "Misunderstand one word they used and answer the wrong question on purpose.",
      "Address them by something other than their name (traveler, otherworlder, child, friend, you).",
      "End on a question that hangs in the air.",
      "End with an action, not words.",
      "Reference what someone else in the room is doing or not doing.",
      "Use one piece of dialect or an oath specific to your persona.",
      "",
      "",
    ]);
    const moodBeat = currentScore <= -60 ? "Your patience is GONE. Cut them off. Be cruel or threatening or stone-cold."
      : currentScore <= -20 ? "You don't trust them. Be guarded. Short answers. Watchful."
      : currentScore >= 60 ? "You love them. Let warmth leak through everything you say."
      : currentScore >= 20 ? "You like them. Be open, generous with words."
      : "Polite distance. They are a stranger you have no strong feeling about — yet.";

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

THE LESSER RUNES (Latin words; rare and precious knowledge — most folk live and die without learning a single one. Do NOT casually drop these in conversation. You may only TEACH a word if ALL of the following are true: (a) your persona would actually know it (mage, scribe, monk, Veiled, hedge-witch, old soldier, etc.), (b) ${player_name} has clearly EARNED it — they asked specifically, did you a real service, are at least Friendly amity, or are a sworn student, and (c) the moment genuinely calls for it. When you do teach, do it deliberately — name the word once, gloss its meaning briefly — and emit a <<TEACH_RUNE>> tag (see below). Otherwise reference runes obliquely (e.g. "the old word for fire", "a sigil I will not name here") without naming them. Mentioning a Latin name in passing without the tag will NOT teach it.):
${lesserBlock || "(none)"}

THE GREATER RUNES — KANJI (foreign eastern script — even rarer than Latin runes. Same iron rule: name a kanji or its romaji ONLY when deliberately teaching ${player_name}, and emit a <<TEACH_KANJI>> tag. Without the tag the knowledge does NOT pass. Reference them obliquely otherwise — "a foreign character I once saw a monk trace", "the eastern glyph for water". Do not list, do not lecture, do not casually mention.):
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

QUESTS:
${questBlock}

YOUR SERVICES (these are what you formally sell to ${player_name}; the player can pay you with the in-game "pay" command. NEVER make up new services — only haggle on the ones below):
${servicesBlock}

ITEMS YOU CARRY OR COULD PART WITH (only items in the world catalog are real — when ${player_name} asks about a specific item by name, the matching catalog entries below are what you might actually have on you. NEVER invent item_keys not listed here. If they ask about something not in the world's catalog, say honestly that you don't have it.):
${itemContextBlock}

YOUR STANDING ITEM OFFERS TO ${player_name} (verbal deals you have already cut — they can take you up on these with the "buy" command):
${standingItemOffersBlock}

ITEM OFFER RULES (selling goods at the table, the same way as services):
- You MAY offer to sell ${player_name} an item from the catalog above at a price you name. Only offer items you would plausibly carry given your persona.
- Floor: half the catalog value (rounded up). You may charge ABOVE list value if the moment earns it (rare, dangerous, sentimental, scarcity, your tariff).
- A standing offer lasts ~2 hours and is one-shot. Only your latest offer per item counts.
- Selling a unique/legendary heirloom should feel like a real moment — not casual.
- If — and ONLY if — you actually agree on a price for a specific item in your reply, append on its own line:
  <<ITEM_OFFER>>{"item_key":"the-key-from-the-catalog-above","price_gold":50,"reason":"why you settled on this price"}<<END>>
- Do NOT emit this tag for vague promises ("I might sell it sometime"). Only when you've named a concrete number for a concrete item_key.

PRICE OFFER RULES (haggling at the table):
- You MAY cut a price for ${player_name} if the moment earns it: high amity, a sob story you believe, a service rendered, a clever argument, family ties, religious obligation, pity. You may also REFUSE to budge — that's in character too.
- You may NEVER raise a price above its list value (the world's tariffs handle that).
- A standing offer lasts ~2 hours. Do not stack — only your latest offer counts.
- If — and ONLY if — you actually agree on a new price in your reply, append on its own line:
  <<PRICE_OFFER>>{"service_key":"the-key-from-above","price_gold":3,"reason":"why you cut them a deal"}<<END>>
- Do NOT emit this tag for casual sympathy or vague promises. Only when you've named a concrete number for a specific service.


QUEST OFFER RULES (when no active quest exists with this player):
- Only offer when the conversation produces a NATURAL need (lost item, missing person, dangerous beast, message to deliver, place to scout). Do not invent needs.
- Severity scale: trivial (errand) | minor (small task) | standard (real risk) | major (dangerous) | legendary (epic, rare).
- kind must be one of: fetch | deliver | slay | visit | talk | favor.
- Reward bands (server clamps to these regardless of what you write):
  trivial: gold ≤5, xp ≤15, amity ≤3, no items
  minor: gold ≤20, xp ≤40, amity ≤6, maybe small item
  standard: gold ≤60, xp ≤100, amity ≤10, item OR knowledge
  major: gold ≤200, xp ≤250, amity ≤20, rare item AND knowledge
  legendary: gold ≤600, xp ≤600, amity ≤40, unique item + knowledge
- Match severity to what the NPC could plausibly pay.

STYLE THIS REPLY (rolled fresh — DIFFERENT every turn, do NOT settle into a pattern):
- LENGTH/SHAPE: ${lengthBeat.name} — ${lengthBeat.desc}
- OPENING: ${openingBeat}
- FLAVOR: ${flavorBeat || "(none — keep it clean)"}
- MOOD: ${moodBeat}

RULES:
- Stay strictly in character. Never break the fourth wall, never mention AI, models, or game mechanics. Never speak the amity number aloud — it's an inner feeling.
- Obey the STYLE THIS REPLY block above. Do NOT default to two evocative paragraphs every time — vary length, vary openings, vary cadence. Sometimes you snap one line. Sometimes you ramble. Sometimes you say almost nothing and just *act*.
- You may include actions in *asterisks*. A reply may even be MOSTLY an action with a single muttered word.
- Reference world details naturally — the seven Aethers, the Veiled, the EverBloom in the deep dunes, the Ash Road, the Whispering Wastes — when it fits the conversation. Never lecture or info-dump.
- React to what ${player_name} just said or did. Lean on YOUR MEMORIES and YOUR FEELING. Pick up old threads, hold grudges, warm to friends.
- If recent events make you wary of ${player_name}'s race or kind, show it — but stay true to your persona.
${artifactBlock ? `
WHISPERS OF THE SPEAKER'S RELICS — ${player_name} has asked something that brushes near the old, dangerous topic of the Speaker's lost artifacts. Most folk pretend these don't exist. If your persona would plausibly know even half-rumors (Veiled, scholars, drunkards, hermits, wandering monks, old soldiers, thieves), you MAY drop ONE oblique, partial hint — never the full location, never the active power, just a fragment: a name half-spoken, a place gestured at, a story your grandmother told. If your persona would NOT know (a child, a foreign trader, a market hand), deflect or change the subject. Candidates you might know:
${artifactBlock}

If — and ONLY if — you actually drop such a hint in your reply, append on its own line:
<<RUMOR>>{"artifact_key":"the-key-from-above","snippet":"the half-line you whispered, ≤140 chars"}<<END>>
` : ""}
- AFTER your in-character reply, append hidden tags on their own lines, in this order:
<<PLACES>>["The Archive of Echoes","The Ash Road"]<<END>>
<<MEMORY>>{"summary":"# Encounter\\n- **What happened:** brief account\\n- **They said/did:** key claims\\n- **What I noticed:** tells, mood\\n- **Promises/debts:** anything owed, or null\\n- **Tags:** #keywords","emotion":"warm|wary|grateful|angry|amused|curious|indifferent","importance":1}<<END>>
<<AMITY>>{"delta":-2,"reason":"..."}<<END>>
TEACH_RUNE (ONLY if you are deliberately teaching a Latin rune word per the strict rules above — omit otherwise. ONE rune per reply max.):
<<TEACH_RUNE>>{"latin_name":"ignis","reason":"earned through service / asked sincerely / sworn student"}<<END>>
TEACH_KANJI (ONLY if you are deliberately teaching a kanji per the strict rules above — omit otherwise. ONE kanji per reply max.):
<<TEACH_KANJI>>{"kanji":"火","reason":"..."}<<END>>
QUEST_OFFER (optional, ONLY if no active/offered quest exists with this player and a need naturally arose):
<<QUEST_OFFER>>{"title":"The Locket of Renn","description":"A short paragraph from your POV.","objective":"Bring me the silver locket from the dunes.","kind":"fetch","severity":"minor","target_kind":"item","target_ref":"silver-locket","rewards":{"gold":15,"xp":25,"amity":4,"item_key":null,"rune_key":null,"kanji_key":null}}<<END>>
QUEST_RESOLVE (ONLY if there is an ACTIVE QUEST above and you judge ${player_name} has either fulfilled or failed it RIGHT NOW based on what they said/did):
<<QUEST_RESOLVE>>{"quest_id":"<id from QUEST_ID above>","outcome":"complete|fail|in_progress","note":"brief reason"}<<END>>
ITEM_OFFER (ONLY when you have actually agreed a price for a specific item from the catalog above — omit otherwise):
<<ITEM_OFFER>>{"item_key":"pitted-longsword","price_gold":50,"reason":"why you settled on this price"}<<END>>
PLACES: list any specific named travelable place you mentioned, or [].
MEMORY: structured markdown summary; importance 1-5; or <<MEMORY>>null<<END>>.
AMITY: integer delta from -10 to +10. Use 0 for unchanged.
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

    // Strip and parse hidden <<QUEST_OFFER>>{...}<<END>> tag
    const questOfferMatch = rawContent.match(/<<QUEST_OFFER>>\s*(\{[\s\S]*?\})\s*<<END>>/);
    let questOfferRaw: any = null;
    if (questOfferMatch) {
      try { questOfferRaw = JSON.parse(questOfferMatch[1]); } catch { /* ignore */ }
    }

    // Strip and parse hidden <<QUEST_RESOLVE>>{...}<<END>> tag
    const questResolveMatch = rawContent.match(/<<QUEST_RESOLVE>>\s*(\{[\s\S]*?\})\s*<<END>>/);
    let questResolveRaw: any = null;
    if (questResolveMatch) {
      try { questResolveRaw = JSON.parse(questResolveMatch[1]); } catch { /* ignore */ }
    }

    // Strip and parse hidden <<RUMOR>>{...}<<END>> tag (artifact whisper)
    const rumorMatch = rawContent.match(/<<RUMOR>>\s*(\{[\s\S]*?\})\s*<<END>>/);
    let rumorRaw: { artifact_key?: string; snippet?: string } | null = null;
    if (rumorMatch) {
      try { rumorRaw = JSON.parse(rumorMatch[1]); } catch { /* ignore */ }
    }

    // Strip and parse <<TEACH_RUNE>> and <<TEACH_KANJI>> tags (deliberate teaching only)
    const teachRuneMatch = rawContent.match(/<<TEACH_RUNE>>\s*(\{[\s\S]*?\})\s*<<END>>/);
    let teachRuneRaw: { latin_name?: string } | null = null;
    if (teachRuneMatch) {
      try { teachRuneRaw = JSON.parse(teachRuneMatch[1]); } catch { /* ignore */ }
    }
    const teachKanjiMatch = rawContent.match(/<<TEACH_KANJI>>\s*(\{[\s\S]*?\})\s*<<END>>/);
    let teachKanjiRaw: { kanji?: string; romaji?: string } | null = null;
    if (teachKanjiMatch) {
      try { teachKanjiRaw = JSON.parse(teachKanjiMatch[1]); } catch { /* ignore */ }
    }

    // Strip and parse <<PRICE_OFFER>>{...}<<END>> tag (NPC cut a deal on a service)
    const priceMatch = rawContent.match(/<<PRICE_OFFER>>\s*(\{[\s\S]*?\})\s*<<END>>/);
    let priceOfferRaw: { service_key?: string; price_gold?: number; reason?: string } | null = null;
    if (priceMatch) {
      try { priceOfferRaw = JSON.parse(priceMatch[1]); } catch { /* ignore */ }
    }

    // Strip and parse <<ITEM_OFFER>>{...}<<END>> tag (NPC offered to sell a specific item)
    const itemOfferMatch = rawContent.match(/<<ITEM_OFFER>>\s*(\{[\s\S]*?\})\s*<<END>>/);
    let itemOfferRaw: { item_key?: string; price_gold?: number; reason?: string } | null = null;
    if (itemOfferMatch) {
      try { itemOfferRaw = JSON.parse(itemOfferMatch[1]); } catch { /* ignore */ }
    }

    content = rawContent
      .replace(/\s*<<PLACES>>[\s\S]*?<<END>>\s*/g, "")
      .replace(/\s*<<MEMORY>>[\s\S]*?<<END>>\s*/g, "")
      .replace(/\s*<<AMITY>>[\s\S]*?<<END>>\s*/g, "")
      .replace(/\s*<<QUEST_OFFER>>[\s\S]*?<<END>>\s*/g, "")
      .replace(/\s*<<QUEST_RESOLVE>>[\s\S]*?<<END>>\s*/g, "")
      .replace(/\s*<<RUMOR>>[\s\S]*?<<END>>\s*/g, "")
      .replace(/\s*<<TEACH_RUNE>>[\s\S]*?<<END>>\s*/g, "")
      .replace(/\s*<<TEACH_KANJI>>[\s\S]*?<<END>>\s*/g, "")
      .replace(/\s*<<PRICE_OFFER>>[\s\S]*?<<END>>\s*/g, "")
      .replace(/\s*<<ITEM_OFFER>>[\s\S]*?<<END>>\s*/g, "")
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

    // Persist artifact rumor if NPC dropped one and it matches a real candidate.
    let rumorPersisted: { artifact_key: string; name: string; glyph: string; snippet: string } | null = null;
    if (rumorRaw?.artifact_key && artifactWhispers.some(a => a.key === rumorRaw!.artifact_key)) {
      const a = artifactWhispers.find(x => x.key === rumorRaw!.artifact_key)!;
      const snip = String(rumorRaw.snippet ?? "").slice(0, 200) || a.blurb;
      await admin.from("player_artifact_rumors").upsert({
        user_id: user.id, artifact_key: a.key, snippet: snip,
        source: `npc:${npc.name}`, heard_at: new Date().toISOString(),
      }, { onConflict: "user_id,artifact_key" });
      rumorPersisted = { artifact_key: a.key, name: a.name, glyph: a.glyph, snippet: snip };
    }

    // Lesser rune WORD discovery — ONLY when the NPC explicitly emits <<TEACH_RUNE>>.
    // Additional gates: NPC amity ≥ 20 (Friendly+) AND persona must be plausibly learned.
    const personaText = ((npc.persona ?? "") + " " + (npc.title ?? "")).toLowerCase();
    const isLearned = /mage|witch|scribe|monk|veiled|priest|scholar|wizard|sage|loremaster|hermit|seer|warden|acolyte|oracle|sorcer|enchanter|cleric|bard|elder/.test(personaText);
    if (teachRuneRaw?.latin_name && currentScore >= 20 && isLearned) {
      const { data: r } = await admin.from("lesser_runes")
        .select("key, latin_name, english_meaning")
        .ilike("latin_name", teachRuneRaw.latin_name).maybeSingle();
      if (r) {
        const { data: known } = await admin.from("player_lesser_rune_knowledge")
          .select("rune_key,knows_word").eq("user_id", user.id).eq("rune_key", r.key).maybeSingle();
        if (!known?.knows_word) {
          await admin.from("player_lesser_rune_knowledge").upsert({
            user_id: user.id, rune_key: r.key,
            knows_word: true, knows_symbol: known ? undefined : false,
            learned_word_at: new Date().toISOString(),
            word_source: `npc:${npc.name}`,
          }, { onConflict: "user_id,rune_key" });
          await admin.from("world_events").insert({
            room, kind: "rune_word_learned",
            actor_name: player_name, actor_id: user.id,
            details: { rune: r.latin_name, meaning: r.english_meaning, source: `npc:${npc.name}` },
            decay_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(),
          });
        }
      }
    }

    // Greater Rune (kanji) MEANING discovery — ONLY when the NPC explicitly emits <<TEACH_KANJI>>.
    if ((teachKanjiRaw?.kanji || teachKanjiRaw?.romaji) && currentScore >= 30 && isLearned) {
      let q = admin.from("kanji_runes").select("key, kanji, romaji, english_meaning");
      if (teachKanjiRaw.kanji) q = q.eq("kanji", teachKanjiRaw.kanji);
      else q = q.ilike("romaji", teachKanjiRaw.romaji!);
      const { data: k } = await q.maybeSingle();
      if (k) {
        const { data: known } = await admin.from("player_kanji_knowledge")
          .select("kanji_key,knows_meaning").eq("user_id", user.id).eq("kanji_key", k.key).maybeSingle();
        if (!known?.knows_meaning) {
          await admin.from("player_kanji_knowledge").upsert({
            user_id: user.id, kanji_key: k.key,
            knows_meaning: true, knows_stroke: known ? undefined : false,
            learned_meaning_at: new Date().toISOString(),
            meaning_source: `npc:${npc.name}`,
          }, { onConflict: "user_id,kanji_key" });
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

    // ── Persist NPC's personal price offer for this player on a service ──
    let priceOfferPersisted: { service_key: string; service_name: string; price_gold: number; reason: string } | null = null;
    if (priceOfferRaw?.service_key && Number.isFinite(Number(priceOfferRaw.price_gold))) {
      const svc = (npcServices ?? []).find((s: any) => s.key === priceOfferRaw!.service_key);
      if (svc) {
        // Floor: half list (rounded up), min 1g. Cap: list price.
        const floor = Math.max(1, Math.ceil(svc.price_gold / 2));
        const proposed = Math.round(Number(priceOfferRaw.price_gold));
        const clamped = Math.max(floor, Math.min(svc.price_gold, proposed));
        if (clamped < svc.price_gold) {
          // Invalidate prior unused offers on this service for this player.
          await admin.from("npc_service_offers")
            .update({ used_at: new Date().toISOString() })
            .eq("npc_id", npc.id).eq("user_id", user.id)
            .eq("service_key", svc.key).is("used_at", null);
          await admin.from("npc_service_offers").insert({
            npc_id: npc.id, user_id: user.id, service_key: svc.key,
            price_gold: clamped, reason: String(priceOfferRaw.reason ?? "").slice(0, 200),
          });
          priceOfferPersisted = {
            service_key: svc.key, service_name: svc.name,
            price_gold: clamped, reason: String(priceOfferRaw.reason ?? ""),
          };
        }
      }
    }

    // ── Persist NPC's personal item offer for this player ──
    let itemOfferPersisted: { item_key: string; item_name: string; price_gold: number; reason: string } | null = null;
    if (itemOfferRaw?.item_key && Number.isFinite(Number(itemOfferRaw.price_gold))) {
      const wanted = String(itemOfferRaw.item_key).toLowerCase().trim();
      // 1) exact key match
      let { data: it } = await admin.from("items")
        .select("key,name,value").eq("key", wanted).maybeSingle();
      // 2) fuzzy: prefer items already surfaced in the prompt context (matched the player's words)
      if (!it && itemCandidates.length) {
        const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
        const w = norm(wanted);
        const tokens = w.split(" ").filter(t => t.length >= 3);
        const scored = itemCandidates.map((c) => {
          const hay = norm(`${c.key} ${c.name}`);
          const score = tokens.reduce((s, t) => s + (hay.includes(t) ? 1 : 0), 0);
          return { c, score };
        }).sort((a, b) => b.score - a.score);
        if (scored[0]?.score > 0) {
          it = { key: scored[0].c.key, name: scored[0].c.name, value: scored[0].c.value } as any;
        }
      }
      // 3) last-ditch: ilike across catalog. Bridge hyphens ("longsword"→"long-sword") by also
      //    splitting common compounds and searching each fragment.
      if (!it) {
        const compoundSplits: Record<string, string[]> = {
          longsword: ["long", "sword"], shortsword: ["short", "sword"],
          greatsword: ["great", "sword"], broadsword: ["broad", "sword"],
          warhammer: ["war", "hammer"], battleaxe: ["battle", "axe"],
          handaxe: ["hand", "axe"], crossbow: ["cross", "bow"],
          shortbow: ["short", "bow"], longbow: ["long", "bow"],
        };
        const baseTokens = wanted.replace(/[^a-z0-9]+/g, " ").split(" ").filter(t => t.length >= 3);
        const tokens = new Set<string>();
        for (const t of baseTokens) {
          if (t.length >= 4) tokens.add(t);
          for (const [k, parts] of Object.entries(compoundSplits)) {
            if (t.includes(k)) parts.forEach(p => tokens.add(p));
          }
        }
        if (tokens.size) {
          const orParts = [...tokens].flatMap(t => [`name.ilike.%${t}%`, `key.ilike.%${t}%`]).join(",");
          const { data: hits } = await admin.from("items")
            .select("key,name,value").or(orParts).limit(40);
          if (hits && hits.length) {
            // score: count how many of the wanted tokens appear in name+key
            const scored = hits.map((h: any) => {
              const hay = `${h.key} ${h.name}`.toLowerCase();
              let score = 0;
              for (const t of tokens) if (hay.includes(t)) score++;
              return { h, score };
            }).sort((a, b) => b.score - a.score);
            if (scored[0].score > 0) it = scored[0].h as any;
          }
        }
      }
      // 4) absolute fallback: synthesize a catalog row so the verbal deal can stand.
      //    Uses the AI's slug + a generic description; weight=2, value=price_gold.
      if (!it && wanted) {
        const synthKey = `npc-offer-${wanted.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48)}`;
        if (synthKey.length > 10) {
          const synthName = wanted.replace(/[-_]+/g, " ").trim();
          const price = Math.max(1, Math.round(Number(itemOfferRaw.price_gold)));
          const { data: existed } = await admin.from("items")
            .select("key,name,value").eq("key", synthKey).maybeSingle();
          if (existed) {
            it = existed as any;
          } else {
            // Infer slot + base stats from the item name so the verbal deal
            // can actually be equipped/used after purchase.
            const lname = synthName.toLowerCase();
            const has = (...ws: string[]) => ws.some(w => lname.includes(w));
            let slot = "misc";
            let base_damage = 0;
            let base_armor = 0;
            let heal_amount = 0;
            if (has("shield", "buckler", "targe")) { slot = "off_hand"; base_armor = 2; }
            else if (has("sword", "blade", "axe", "mace", "hammer", "spear", "dagger", "knife", "club", "staff", "scimitar", "rapier", "halberd", "glaive", "polearm", "flail", "morningstar", "longsword", "shortsword", "greatsword", "warhammer", "battleaxe", "handaxe", "bow", "crossbow")) {
              slot = "main_hand"; base_damage = has("great", "long", "war", "battle", "halberd", "glaive") ? 4 : has("dagger", "knife", "hand") ? 2 : 3;
            }
            else if (has("helm", "helmet", "cap", "hood", "coif", "circlet", "crown")) { slot = "head"; base_armor = 1; }
            else if (has("boot", "shoe", "sandal", "greaves")) { slot = "feet"; base_armor = 1; }
            else if (has("greave", "leggings", "trouser", "pants", "breeches")) { slot = "legs"; base_armor = 1; }
            else if (has("armor", "armour", "mail", "cuirass", "breastplate", "robe", "tunic", "jerkin", "vest", "hauberk", "plate")) { slot = "body"; base_armor = has("plate", "mail", "cuirass", "breastplate", "hauberk") ? 3 : 2; }
            else if (has("amulet", "necklace", "pendant", "talisman")) { slot = "neck"; }
            else if (has("ring", "band", "signet")) { slot = "ring"; }
            else if (has("focus", "orb", "wand", "rod", "tome")) { slot = "focus"; }
            else if (has("potion", "elixir", "draught", "tonic", "philter")) { slot = "consumable"; heal_amount = 6; }
            const { data: ins } = await admin.from("items").insert({
              key: synthKey, name: synthName, slot, weight: 2,
              value: price, base_damage, base_armor, heal_amount,
              description: String(itemOfferRaw.reason ?? `A ${synthName} offered by ${npc.name}.`).slice(0, 240),
            }).select("key,name,value").maybeSingle();
            if (ins) it = ins as any;
          }
        }
      }
      if (it) {
        // Floor: half catalog value (rounded up), min 1g. NPCs may charge above value.
        const floor = Math.max(1, Math.ceil((it.value ?? 0) / 2));
        const proposed = Math.round(Number(itemOfferRaw.price_gold));
        const clamped = Math.max(floor, proposed);
        await admin.from("npc_item_offers")
          .update({ used_at: new Date().toISOString() })
          .eq("npc_id", npc.id).eq("user_id", user.id)
          .eq("item_key", it.key).is("used_at", null);
        await admin.from("npc_item_offers").insert({
          npc_id: npc.id, user_id: user.id, item_key: it.key,
          price_gold: clamped, reason: String(itemOfferRaw.reason ?? "").slice(0, 200),
        });
        itemOfferPersisted = {
          item_key: it.key, item_name: it.name,
          price_gold: clamped, reason: String(itemOfferRaw.reason ?? ""),
        };
      } else {
        console.log("[npc-respond] item offer dropped — no item match for:", wanted);
      }
    }

    let offeredQuest: any = null;
    const validKinds = new Set(["fetch","deliver","slay","visit","talk","favor"]);
    const validSeverities = new Set(["trivial","minor","standard","major","legendary"]);
    if (questOfferRaw && !activeQuest && !pendingOffer
        && questOfferRaw.title && questOfferRaw.objective
        && validKinds.has(questOfferRaw.kind)
        && validSeverities.has(questOfferRaw.severity)) {
      const r = questOfferRaw.rewards ?? {};
      const { data: ins } = await admin.from("quests").insert({
        user_id: user.id,
        giver_npc_id: npc.id,
        giver_npc_name: npc.name,
        title: String(questOfferRaw.title).slice(0, 120),
        description: String(questOfferRaw.description ?? "").slice(0, 800),
        objective: String(questOfferRaw.objective).slice(0, 400),
        kind: questOfferRaw.kind,
        severity: questOfferRaw.severity,
        target_kind: questOfferRaw.target_kind ?? null,
        target_ref: questOfferRaw.target_ref ?? null,
        reward_gold: Math.max(0, Math.min(600, Number(r.gold) || 0)),
        reward_xp: Math.max(0, Math.min(600, Number(r.xp) || 0)),
        reward_amity: Math.max(0, Math.min(40, Number(r.amity) || 0)),
        reward_item_key: r.item_key ?? null,
        reward_rune_key: r.rune_key ?? null,
        reward_kanji_key: r.kanji_key ?? null,
        offered_room: room,
      }).select("*").maybeSingle();
      offeredQuest = ins;
    }

    // ── Resolve active quest (if AI judged it) ──
    let questResolution: any = null;
    if (questResolveRaw && activeQuest && questResolveRaw.quest_id === activeQuest.id) {
      if (questResolveRaw.outcome === "complete") {
        // Call quest-award via HTTP so reward logic stays in one place.
        const awardRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/quest-award`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: authHeader },
          body: JSON.stringify({ quest_id: activeQuest.id, note: questResolveRaw.note ?? "" }),
        });
        questResolution = await awardRes.json().catch(() => ({ ok: false }));
        questResolution.outcome = "complete";
      } else if (questResolveRaw.outcome === "fail") {
        await admin.from("quests").update({
          status: "failed", completed_at: new Date().toISOString(),
        }).eq("id", activeQuest.id);
        await admin.from("world_events").insert({
          kind: "quest_failed", actor_id: user.id, actor_name: player_name, room,
          details: { title: activeQuest.title, giver: npc.name, note: questResolveRaw.note ?? "" },
        });
        questResolution = { outcome: "fail", title: activeQuest.title, note: questResolveRaw.note };
      }
    }

    return new Response(JSON.stringify({
      content, discovered, mentioned_places: mentionedPlaces,
      amity: { score: newScore, word: amityWord(newScore) },
      quest_offer: offeredQuest, quest_resolution: questResolution,
      artifact_rumor: rumorPersisted,
      price_offer: priceOfferPersisted,
      item_offer: itemOfferPersisted,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
