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

    const { data: room } = await admin.from("rooms").select("*").eq("slug", roomSlug).maybeSingle();
    if (!room) return new Response(JSON.stringify({ error: "room not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Density by room kind. [min, max] living NPCs we want present.
    // Bustling places (markets, squares, taverns, capitals) feel crowded.
    // Deep wilds, crypts, dragon lairs feel empty.
    const DENSITY: Record<string, [number, number]> = {
      market:   [4, 7],
      square:   [3, 6],
      tavern:   [3, 6],
      capital:  [3, 5],
      gate:     [2, 4],
      hall:     [2, 3],
      shore:    [2, 3],
      road:     [1, 2],
      desert:   [0, 2],
      hollow:   [1, 2],
      enclave:  [1, 3],
      wilds:    [0, 1],
      ruin:     [0, 1],
      cave:     [0, 1],
      crypt:    [2, 4],  // souls — hidden until uncovered, silent without Necros
      lair:     [0, 0],
      room:     [1, 2],
    };
    const [minN, maxN] = DENSITY[room.kind] ?? [1, 2];

    // Count current living residents in this room (excluding companions / dead).
    const nowIso = new Date().toISOString();
    const { data: existing } = await admin.from("npcs").select("id")
      .eq("room", roomSlug)
      .or(`dead_until.is.null,dead_until.lte.${nowIso}`);
    const have = existing?.length ?? 0;
    if (have >= minN) {
      return new Response(JSON.stringify({ added: 0, have, target: [minN, maxN], reason: "room already populated" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    // Top up to a value somewhere in [minN, maxN]
    const target = minN + Math.floor(Math.random() * (maxN - minN + 1));
    const need = Math.max(1, target - have);

    const isCrypt = room.kind === "crypt";

    // Pull a generous sample of names ALREADY in the world so the AI cannot duplicate them.
    // (The AI was repeating prompt-example names like "Vetch", "Pell", "Senna Two-Knives" across cities.)
    const { data: takenRows } = await admin.from("npcs").select("name").limit(2000);
    const takenNames = Array.from(new Set((takenRows ?? []).map(r => String(r.name).trim()))).filter(Boolean);
    // Forbid both the full name and the first token (covers "Pell" vs "Pell Half-Penny").
    const forbidden = new Set<string>();
    for (const n of takenNames) {
      forbidden.add(n.toLowerCase());
      const first = n.split(/\s+/)[0]?.toLowerCase();
      if (first) forbidden.add(first);
    }
    // Cap the prompt list — too long and the model ignores it.
    const forbiddenList = takenNames.slice(-400).join(", ");

    const NAMING_RULES = `
NAMING — CRITICAL. Every name must be ORIGINAL and UNIQUE in this world.
HARD RULES:
  • Do NOT reuse any name (or first-name token) from this forbidden list — these are already living people elsewhere in the world: ${forbiddenList}
  • Do NOT use generic fantasy filler (Aerys, Eldra, Lysander, Kael, Thorne, Marcus, Elara, Seraphina, Cassius). Avoid -ion, -ara, -wyn, -iel endings that read as auto-generated.
  • Do NOT copy any example names from these instructions — examples are SHAPES, not names to use.
STYLE GUIDANCE (invent fresh names in these shapes; do not literally reuse the bracketed examples):
  • working-class / occupational / place-rooted [shape: <given> <trade-or-place>]
  • compound nicknames earned by deed or defect [shape: <number-or-feature>-<noun> <name>]
  • regional flavor — short blunt syllables for desert/wild; liquid syllables for coast; iron syllables for the Bastion
  • roughly 1 in 3 NPCs get a SINGLE-WORD name or nickname only
Each name in this batch must come from a different mouth — no shared prefixes, suffixes, or rhythm.`;

    const system = isCrypt
      ? `You populate a tomb in EverBloom with **lingering souls** — the dead who never left. They are not living people. Each is a memory bound to bone, dust, or a relic in this place.
${NAMING_RULES}

Return STRICT JSON:
{"npcs":[{"name":"","title":"","persona":"","greeting":"","schedule":{"dawn":{"room":"here","activity":""},"morning":{...},"midday":{...},"dusk":{...},"night":{...}}}]}

Generate exactly ${need} souls. Each persona (2-3 sentences) describes WHO THEY WERE in life, HOW they died, and what unfinished thing keeps them tethered here. Title should be a death-epithet ("the Drowned Scribe", "the Last Coin-Counter"). Greeting is what they would whisper IF a living tongue could hear them — a fragment, a grievance, a name. Activities are present-tense but ghostly ("rearranging coins that no longer exist", "weeping over a sealed jar", "counting the seams in the wall").`
      : `You add residents to a location in EverBloom (the dying world; First City; seven Aethers; mouth-bound Veiled).
${NAMING_RULES}

Return STRICT JSON:
{"npcs":[{"name":"","title":"","persona":"","greeting":"","schedule":{"dawn":{"room":"here","activity":""},"morning":{...},"midday":{...},"dusk":{...},"night":{...}}}]}

Generate exactly ${need} NPCs that BELONG here. They live here ("here" in schedule). Each must be DISTINCT — different names, different roles, different voices, different speech rhythms. Persona 2-3 sentences with at least one specific physical detail (a scar, a limp, missing teeth, a stained apron). Greeting may include *brief action* and a verbal tic. Activities are short, present-tense, in-world.`;

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
    const rows = (Array.isArray(parsed.npcs) ? parsed.npcs.slice(0, need) : [])
      .filter((n: any) => {
        if (!n?.name || !n?.persona) return false;
        const nm = String(n.name).trim().toLowerCase();
        const first = nm.split(/\s+/)[0];
        // Skip any name (or first-token collision) that already exists in the world.
        if (forbidden.has(nm) || (first && forbidden.has(first))) return false;
        // Claim it for this batch so the AI can't give us two duplicates in one response.
        forbidden.add(nm);
        if (first) forbidden.add(first);
        return true;
      })
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
          is_soul: isCrypt,
          hidden: isCrypt,
          requires_rune_key: isCrypt ? "necros" : null,
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
