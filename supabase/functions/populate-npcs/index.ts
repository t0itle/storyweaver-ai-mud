// Top up NPCs in a room if it has none. Called by the client when a player enters.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function timeBucket(d = new Date()): string {
  const h = d.getUTCHours();
  if (h < 6) return "night";
  if (h < 9) return "dawn";
  if (h < 13) return "morning";
  if (h < 17) return "midday";
  if (h < 21) return "dusk";
  return "night";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { room: roomSlug } = await req.json();
    if (!roomSlug) return new Response(JSON.stringify({ error: "room required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Only top up rooms that have zero living NPCs.
    const nowIso = new Date().toISOString();
    const { data: existing } = await admin.from("npcs").select("id")
      .eq("room", roomSlug)
      .or(`dead_until.is.null,dead_until.lte.${nowIso}`)
      .limit(1);
    if (existing && existing.length) {
      return new Response(JSON.stringify({ added: 0, reason: "room already populated" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: room } = await admin.from("rooms").select("*").eq("slug", roomSlug).maybeSingle();
    if (!room) return new Response(JSON.stringify({ error: "room not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Some places shouldn't get residents (deep wilds / ruins / caves). Roll low.
    const sparseKinds = new Set(["wilds","ruin","cave","crypt"]);
    const maxNpcs = sparseKinds.has(room.kind) ? 1 : 2;

    const system = `You add residents to a location in EverBloom (the dying world; First City; seven Aethers; mouth-bound Veiled).

Return STRICT JSON:
{"npcs":[{"name":"","title":"","persona":"","greeting":"","schedule":{"dawn":{"room":"here","activity":""},"morning":{...},"midday":{...},"dusk":{...},"night":{...}}}]}

Generate 1 to ${maxNpcs} NPCs that BELONG here. They live here ("here" in schedule). Persona 2-3 sentences. Greeting may include *brief action*. Activities are short, present-tense, in-world.`;
    const userMsg = `Location: ${room.name} (${room.kind}). ${room.description}\nAmbience: ${room.ambience ?? ""}`;

    const ai = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: system }, { role: "user", content: userMsg }],
        response_format: { type: "json_object" },
      }),
    });
    if (!ai.ok) throw new Error(`AI ${ai.status}`);
    const aiJson = await ai.json();
    let parsed: any = {};
    try { parsed = JSON.parse(aiJson.choices?.[0]?.message?.content ?? "{}"); } catch {}

    const bucket = timeBucket();
    const rows = (Array.isArray(parsed.npcs) ? parsed.npcs.slice(0, maxNpcs) : [])
      .filter((n: any) => n?.name && n?.persona)
      .map((n: any) => {
        const sched: Record<string, { room: string; activity: string }> = {};
        for (const b of ["dawn","morning","midday","dusk","night"]) {
          const e = n.schedule?.[b];
          sched[b] = {
            room: (!e?.room || e.room === "here") ? roomSlug : String(e.room),
            activity: e?.activity ?? "going about their day",
          };
        }
        return {
          room: roomSlug,
          home_room: roomSlug,
          name: String(n.name).slice(0, 60),
          title: n.title ? String(n.title).slice(0, 80) : null,
          persona: String(n.persona).slice(0, 1000),
          greeting: n.greeting ? String(n.greeting).slice(0, 400) : null,
          schedule: sched,
          current_activity: sched[bucket].activity,
          last_tick_at: new Date().toISOString(),
        };
      });
    if (rows.length) await admin.from("npcs").insert(rows);

    return new Response(JSON.stringify({ added: rows.length, names: rows.map(r => r.name) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
