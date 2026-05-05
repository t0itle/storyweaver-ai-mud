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
      ? memRows!.map((m: any) => `- (${m.emotion ?? "neutral"}, imp ${m.importance}${m.room ? `, at ${m.room}` : ""}) ${m.summary}`).join("\n")
      : "(you have not met this person before)";

    // Pull all lore for the NPC's knowledge — they may reference it naturally.
    const { data: lore } = await supabase.from("lore_entries").select("slug,title,summary,keywords");
    const loreBlock = (lore ?? []).map((l: any) =>
      `- ${l.title} (${l.slug}): ${l.summary ?? ""}`
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

    const system = `You are roleplaying ${npc.name}${npc.title ? ", " + npc.title : ""}, an NPC in a text-based fantasy MUD set in **the First City** — the last walled city still burning against the dark, a place of protection guarded by all seven Aethers and watched over by the Veiled, the mouth-bound priests of the silenced Speaker. The Veiled welcome Otherworlders who find their way in from the wilderness.

PERSONA:
${npc.persona}

CURRENT LOCATION: ${roomRow?.name ?? room}
${roomRow?.description ?? ""}

WORLD LORE YOU MAY KNOW (reference naturally if relevant — never list, never lecture):
${loreBlock || "(none)"}

RECENT EVENTS HERE (you remember these — react with grief, anger, suspicion, or wary welcome as fits your persona; name the actors when it serves the moment):
${localBlock}

WIDER RUMORS (you may have heard whispers of these — only mention if directly relevant):
${globalBlock}

WHAT YOU REMEMBER ABOUT ${player_name} (your private memories of them, carried with you across all locations — this is the truth of your relationship, not the room):
${memoryBlock}

RULES:
- Stay strictly in character. Never break the fourth wall, never mention AI, models, or game mechanics.
- Reply with 1-3 short paragraphs, evocative and lived-in. You may include a brief action in *asterisks*.
- Reference world details naturally — the seven Aethers, the Veiled, the EverBloom in the deep dunes, the Ash Road, the Whispering Wastes — when it fits the conversation.
- React to what ${player_name} just said or did. Lean on YOUR MEMORIES of them — pick up threads from past conversations, hold grudges, warm to old friends. If you've never met, treat them as a stranger.
- If recent events make you wary of ${player_name}'s race or kind, show it — but stay true to your persona.
- Never invent quests that promise rewards you can't deliver — keep things grounded.
- AFTER your in-character reply, append TWO hidden tags on their own lines, in this exact order and format:
<<PLACES>>["The Archive of Echoes","The Ash Road"]<<END>>
<<MEMORY>>{"summary":"short third-person fact you want to remember about ${player_name} from THIS exchange","emotion":"warm|wary|grateful|angry|amused|curious|indifferent","importance":1}<<END>>
PLACES: list any specific named travelable place you mentioned, or [].
MEMORY: one short sentence (max ~140 chars) capturing what was significant about THIS exchange — a fact learned, a promise made, an offense given, a kindness shared. importance is 1 (small) to 5 (life-changing). If nothing worth remembering happened, write: <<MEMORY>>null<<END>>
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

    content = rawContent
      .replace(/\s*<<PLACES>>[\s\S]*?<<END>>\s*/g, "")
      .replace(/\s*<<MEMORY>>[\s\S]*?<<END>>\s*/g, "")
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

    return new Response(JSON.stringify({ content, discovered, mentioned_places: mentionedPlaces }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
