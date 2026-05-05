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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Service-role client for writes (rooms table has no insert policy for users).
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
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

    // 1. Try fuzzy match against existing rooms (by name, case-insensitive)
    const { data: existing } = await admin.from("rooms").select("slug,name").ilike("name", `%${name}%`).limit(1);
    if (existing && existing.length) {
      return new Response(JSON.stringify({ slug: existing[0].slug, name: existing[0].name, created: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Try slug match too
    const baseSlug = slugify(name);
    if (baseSlug) {
      const { data: bySlug } = await admin.from("rooms").select("slug,name").eq("slug", baseSlug).maybeSingle();
      if (bySlug) {
        return new Response(JSON.stringify({ slug: bySlug.slug, name: bySlug.name, created: false }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // 2. Generate room via Lovable AI
    const system = `You write rooms for a text MUD set in EverBloom — a dying world where the First City still burns against the dark, guarded by the seven Aethers and the mouth-bound Veiled (priests of the silenced Speaker). Tone: evocative, lived-in, 2-4 sentences.

Return STRICT JSON with shape:
{"name": "The X of Y", "description": "...", "ambience": "short sensory line"}

Rules:
- Name must read like a real place; keep "The" prefix if natural.
- Description: 2-4 sentences. Specific details, smells, light, sound. No second person ("you").
- Ambience: one short sensory phrase (under 100 chars).
- No mechanics, no quest text, no bullet lists. Pure prose.`;

    const userMsg = `Generate the room called "${name}".${hint ? `\n\nContext from the rumor: ${hint}` : ""}`;

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
    if (!ai.ok) {
      console.error("AI error", ai.status, await ai.text());
      throw new Error("AI gateway error");
    }
    const aiJson = await ai.json();
    const raw = aiJson.choices?.[0]?.message?.content ?? "{}";
    let parsed: { name?: string; description?: string; ambience?: string } = {};
    try { parsed = JSON.parse(raw); } catch { parsed = {}; }
    const finalName = (parsed.name || name).trim();
    const description = (parsed.description || `${finalName} stands quiet, waiting to be discovered.`).trim();
    const ambience = (parsed.ambience || "").trim().slice(0, 200);

    // 3. Pick a unique slug
    let slug = slugify(finalName) || slugify(name) || `place-${crypto.randomUUID().slice(0, 8)}`;
    {
      const { data: clash } = await admin.from("rooms").select("slug").eq("slug", slug).maybeSingle();
      if (clash) slug = `${slug}-${crypto.randomUUID().slice(0, 4)}`;
    }

    // 4. Insert room. Exits left empty — fast-travel handles arrival/return.
    const { error: insErr } = await admin.from("rooms").insert({
      slug, name: finalName, description, ambience: ambience || null, exits: {},
    });
    if (insErr) throw insErr;

    // 5. Log a world event so NPCs/players see this place "entered the world".
    await admin.from("world_events").insert({
      kind: "location_discovered",
      actor_name: user.user_metadata?.username ?? "a wanderer",
      actor_id: user.id,
      target_name: finalName,
      room: fromRoom ?? slug,
      details: { slug, hint },
    });

    return new Response(JSON.stringify({ slug, name: finalName, created: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
