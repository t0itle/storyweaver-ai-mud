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

    // Pull all lore for the NPC's knowledge — they may reference it naturally.
    const { data: lore } = await supabase.from("lore_entries").select("slug,title,summary,keywords");
    const loreBlock = (lore ?? []).map((l: any) =>
      `- ${l.title} (${l.slug}): ${l.summary ?? ""}`
    ).join("\n");

    const system = `You are roleplaying ${npc.name}${npc.title ? ", " + npc.title : ""}, an NPC in a text-based fantasy MUD set in the volcanic frontier village of Ember-Hold.

PERSONA:
${npc.persona}

CURRENT LOCATION: ${roomRow?.name ?? room}
${roomRow?.description ?? ""}

WORLD LORE YOU MAY KNOW (reference naturally if relevant — never list, never lecture):
${loreBlock || "(none)"}

RULES:
- Stay strictly in character. Never break the fourth wall, never mention AI, models, or game mechanics.
- Reply with 1-3 short paragraphs, evocative and lived-in. You may include a brief action in *asterisks*.
- Reference world details, rumors, the leaning black tower in the south, the Ash Road, the Whispering Wastes when natural.
- React to what ${player_name} just said or did. If they ask something you wouldn't know, deflect in character.
- Never invent quests that promise rewards you can't deliver — keep things grounded.`;

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
    const content = data.choices?.[0]?.message?.content?.trim() ?? "...";

    // Insert NPC message (user_id null is allowed by RLS)
    await supabase.from("messages").insert({
      room,
      npc_id: npc.id,
      author_name: npc.name,
      kind: "npc",
      content,
      user_id: null,
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

    return new Response(JSON.stringify({ content, discovered }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
