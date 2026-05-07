import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function slugify(s: string) {
  return s.toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function timeBucket(d = new Date()): "dawn" | "morning" | "midday" | "dusk" | "night" {
  const h = d.getUTCHours();
  if (h < 6) return "night";
  if (h < 9) return "dawn";
  if (h < 13) return "morning";
  if (h < 17) return "midday";
  if (h < 21) return "dusk";
  return "night";
}

const ROOM_KINDS = ["room","hall","tavern","market","square","gate","road","shore","grove","ruin","tower","camp","wilds","clearing","cave","temple","bridge","dock","garden","crypt","loft","hollow"];

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

    const body = await req.json();
    const name: string = (body?.name ?? "").toString().trim();
    const hint: string = (body?.hint ?? "").toString().trim();
    const fromRoom: string | null = body?.from_room ?? null;
    if (!name || name.length < 3 || name.length > 80) {
      return new Response(JSON.stringify({ error: "name required (3-80 chars)" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Gate hidden / faction-locked rooms: pull speaker's faction first.
    const { data: speaker } = await admin.from("profiles")
      .select("faction, non_serviam_at").eq("id", user.id).maybeSingle();
    const speakerFaction = speaker?.non_serviam_at ? "chaos" : (speaker?.faction ?? null);

    // 1. Existing match
    const { data: existing } = await admin.from("rooms")
      .select("slug,name,hidden,requires_faction").ilike("name", `%${name}%`).limit(1);
    if (existing && existing.length) {
      const r = existing[0] as any;
      // Hidden + faction-locked rooms only reveal themselves to those who belong.
      if (r.requires_faction && r.requires_faction !== speakerFaction) {
        return new Response(JSON.stringify({ error: "No such place answers to that name." }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ slug: r.slug, name: r.name, created: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const baseSlug = slugify(name);
    if (baseSlug) {
      const { data: bySlug } = await admin.from("rooms").select("slug,name").eq("slug", baseSlug).maybeSingle();
      if (bySlug) {
        return new Response(JSON.stringify({ slug: bySlug.slug, name: bySlug.name, created: false }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // 2. Generate room + NPCs in one AI call
    const system = `You build locations and inhabitants for EverBloom — a dying world where the First City still burns against the dark, guarded by the seven Aethers and the mouth-bound Veiled (priests of the silenced Speaker). Tone: evocative, lived-in.

Return STRICT JSON:
{
  "name": "The X of Y",
  "kind": "one of: ${ROOM_KINDS.join(", ")}",
  "label": "single short word the UI uses for this kind of place (e.g. Hall, Clearing, Dunes, Road, Tavern, Grove, Ruin, Tower)",
  "description": "2-4 sentences. Specific sensory detail. No second person.",
  "ambience": "short sensory phrase, under 100 chars",
  "npcs": [
    {
      "name": "given name",
      "title": "short epithet (e.g. 'the Charm-seller')",
      "persona": "2-3 sentences: appearance, manner, what they want",
      "greeting": "first line they'd speak, may include *brief action*",
      "schedule": {
        "dawn":    {"room": "here|elsewhere-name-or-blank", "activity": "what they're doing"},
        "morning": {"room": "...", "activity": "..."},
        "midday":  {"room": "...", "activity": "..."},
        "dusk":    {"room": "...", "activity": "..."},
        "night":   {"room": "...", "activity": "..."}
      }
    }
  ]
}

Rules:
- Generate 1 to 3 NPCs that *belong* in this place. If the place is hostile/empty (ruin, deep wilds), 0-1 is fine.
- Each NPC's home is THIS location. In their schedule, use the literal string "here" for this room. Other entries may say "here" too — most NPCs do not wander far.
- Activities must be short, present-tense, in-world (e.g. "lighting the hearth lanterns", "haggling over salt", "asleep beneath a grey cloak").
- "kind" must be from the allowed list. "label" is what we'd call this kind of place in one word.
- No mechanics, no quest text. Pure prose.`;

    const userMsg = `Generate the location called "${name}".${hint ? `\n\nContext from the rumor: ${hint}` : ""}`;

    const ai = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: system }, { role: "user", content: userMsg }],
        response_format: { type: "json_object" },
      }),
    });
    if (ai.status === 429) return new Response(JSON.stringify({ error: "rate limited" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (ai.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!ai.ok) { console.error("AI error", ai.status, await ai.text()); throw new Error("AI gateway error"); }

    const aiJson = await ai.json();
    const raw = aiJson.choices?.[0]?.message?.content ?? "{}";
    let parsed: any = {};
    try { parsed = JSON.parse(raw); } catch { parsed = {}; }

    const finalName = (parsed.name || name).trim();
    const description = (parsed.description || `${finalName} stands quiet, waiting to be discovered.`).trim();
    const ambience = (parsed.ambience || "").trim().slice(0, 200);
    const kind = ROOM_KINDS.includes(parsed.kind) ? parsed.kind : "room";
    const label = (parsed.label || "Place").toString().trim().slice(0, 24);

    let slug = slugify(finalName) || slugify(name) || `place-${crypto.randomUUID().slice(0, 8)}`;
    {
      const { data: clash } = await admin.from("rooms").select("slug").eq("slug", slug).maybeSingle();
      if (clash) slug = `${slug}-${crypto.randomUUID().slice(0, 4)}`;
    }

    const { error: insErr } = await admin.from("rooms").insert({
      slug, name: finalName, description, ambience: ambience || null, exits: {}, kind, label,
    });
    if (insErr) throw insErr;

    // Auto-weave: if discovered while standing in a real room, wire bidirectional exits.
    if (fromRoom && fromRoom !== slug) {
      const { data: origin } = await admin.from("rooms").select("slug,exits").eq("slug", fromRoom).maybeSingle();
      if (origin) {
        const originExits: Record<string, string> = { ...(origin.exits ?? {}) };
        // Pick a free direction key on the origin so the new place is reachable.
        const preferred = ["out", "north", "east", "south", "west", "in", "up", "down"];
        let originKey = preferred.find(k => !originExits[k]);
        if (!originKey) originKey = slugify(finalName).slice(0, 12) || "path";
        originExits[originKey] = slug;
        await admin.from("rooms").update({ exits: originExits }).eq("slug", fromRoom);
        // The new room always points "back" to where the player came from.
        await admin.from("rooms").update({ exits: { back: fromRoom } }).eq("slug", slug);
      }
    }

    // 3. Insert NPCs (resolve "here" to this slug, leave others as-is to be resolved later)
    const npcsIn = Array.isArray(parsed.npcs) ? parsed.npcs.slice(0, 3) : [];
    const bucket = timeBucket();
    const npcRows = npcsIn
      .filter((n: any) => n?.name && n?.persona)
      .map((n: any) => {
        const sched: Record<string, { room: string; activity: string }> = {};
        for (const b of ["dawn","morning","midday","dusk","night"]) {
          const e = n.schedule?.[b];
          sched[b] = {
            room: (!e?.room || e.room === "here") ? slug : String(e.room),
            activity: e?.activity ?? "going about their day",
          };
        }
        const here = sched[bucket];
        return {
          room: here.room === slug ? slug : slug, // start them here on creation
          home_room: slug,
          name: String(n.name).slice(0, 60),
          title: n.title ? String(n.title).slice(0, 80) : null,
          persona: String(n.persona).slice(0, 1000),
          greeting: n.greeting ? String(n.greeting).slice(0, 400) : null,
          schedule: sched,
          current_activity: here.activity,
          last_tick_at: new Date().toISOString(),
        };
      });
    if (npcRows.length) await admin.from("npcs").insert(npcRows);

    await admin.from("world_events").insert({
      kind: "location_discovered",
      actor_name: user.user_metadata?.username ?? "a wanderer",
      actor_id: user.id,
      target_name: finalName,
      room: fromRoom ?? slug,
      details: { slug, hint, seeded_npcs: npcRows.map(n => n.name) },
    });

    return new Response(JSON.stringify({ slug, name: finalName, created: true, label, kind, npcs: npcRows.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
