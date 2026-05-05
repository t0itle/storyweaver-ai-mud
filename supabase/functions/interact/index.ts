// Generic "interact" — handles read/open/touch/smell/listen/taste/push/pull/light/sit/kneel/pray/feel/break/etc.
// Resolves the target against the player's inventory, NPCs in the room, or just the room itself,
// then asks the AI to write a short, in-world flavor response. May unlock lore.
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

    const { verb, target, room, player_name } = await req.json();
    const v = String(verb || "").trim().toLowerCase();
    const t = String(target || "").trim();
    if (!v) return new Response(JSON.stringify({ error: "verb required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const [{ data: roomRow }, { data: invRows }, { data: npcs }] = await Promise.all([
      supabase.from("rooms").select("*").eq("slug", room).maybeSingle(),
      supabase.from("player_items").select("quantity, items(name,description,slot)").eq("user_id", user.id),
      supabase.from("npcs").select("name,title,current_activity").eq("room", room),
    ]);

    // Try to find the target among inventory items, NPCs, or just leave as room object.
    let resolvedKind: "item" | "npc" | "world" = "world";
    let resolvedName: string = t || "the surroundings";
    let resolvedDesc: string = "";

    if (t) {
      const lower = t.toLowerCase();
      const hit = (invRows ?? []).find((r: any) => r.items?.name?.toLowerCase().includes(lower));
      if (hit) {
        resolvedKind = "item";
        resolvedName = hit.items.name;
        resolvedDesc = hit.items.description ?? "";
      } else {
        const npc = (npcs ?? []).find((n: any) => n.name.toLowerCase().includes(lower));
        if (npc) {
          resolvedKind = "npc";
          resolvedName = npc.name;
          resolvedDesc = `${npc.title ?? ""}. Currently: ${npc.current_activity ?? "present"}.`;
        }
      }
    }

    const { data: lore } = await supabase.from("lore_entries").select("slug,title,summary,keywords");

    const system = `You narrate small in-world interactions for EverBloom — a dying world; First City; seven Aethers; mouth-bound Veiled (priests of the silenced Speaker); the EverBloom in the deep dunes; the Shadow as unspoken counterweight.

Write a single short paragraph (1-3 sentences, max ~70 words) describing what happens when ${player_name} ${v}s "${resolvedName}". Stay grounded, evocative, sensory. No second person ("you"). No game mechanics. No quest hooks unless the object naturally implies one.

If the object is a scroll/book/inscription/sign and the verb is "read", invent SHORT in-world text (a fragment, a line, a marginal note) that fits the place and lore — never modern, never meta.

If the verb cannot meaningfully apply (e.g. "drink the wall"), describe the attempt failing in-character with dignity, briefly.

Reference world lore naturally if it fits — never list it.`;

    const ctx = `LOCATION: ${roomRow?.name ?? room}
${roomRow?.description ?? ""}

TARGET (${resolvedKind}): ${resolvedName}
${resolvedDesc ? `Details: ${resolvedDesc}` : ""}

VERB: ${v}`;

    const ai = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: ctx },
        ],
      }),
    });
    if (ai.status === 429) return new Response(JSON.stringify({ error: "rate limited" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (ai.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!ai.ok) { console.error("AI", ai.status, await ai.text()); throw new Error("AI gateway error"); }

    const data = await ai.json();
    const content = data.choices?.[0]?.message?.content?.trim() ?? `${player_name} ${v}s the ${resolvedName}, but nothing happens.`;

    // Lore discovery scan
    const lower = content.toLowerCase();
    const discovered: string[] = [];
    for (const l of (lore ?? []) as any[]) {
      const kws = [l.slug, ...(l.keywords ?? [])].map((k: string) => k.toLowerCase());
      if (kws.some(k => k && lower.includes(k))) discovered.push(l.slug);
    }
    if (discovered.length) {
      await supabase.from("player_lore_discoveries").upsert(
        discovered.map(slug => ({ user_id: user.id, lore_slug: slug, source: `interact:${v}:${resolvedName}` })),
        { onConflict: "user_id,lore_slug", ignoreDuplicates: true },
      );
    }

    return new Response(JSON.stringify({ content, kind: resolvedKind, target: resolvedName, discovered }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
