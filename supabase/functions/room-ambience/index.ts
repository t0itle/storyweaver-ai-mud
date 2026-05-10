// Generates a single short, sensory ambient line tailored to the room + player + moment.
// Uses Lovable AI Gateway (no extra key required).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function timeBucket(d = new Date()): string {
  const h = d.getUTCHours();
  if (h < 6) return "the small hours before dawn";
  if (h < 9) return "first light";
  if (h < 13) return "late morning";
  if (h < 17) return "the long afternoon";
  if (h < 21) return "dusk";
  return "deep night";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") ?? "";
    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } }
    );
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "unauth" }), { status: 401, headers: corsHeaders });

    const body = await req.json().catch(() => ({}));
    const recent: string[] = Array.isArray(body.recent) ? body.recent.slice(-8) : [];

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Pull player + room + present NPCs + a few recent world events in this room.
    const { data: profile } = await admin.from("profiles")
      .select("username, race, current_room, aether, faction, merit, level, hp, max_hp, corruption, char_description")
      .eq("id", user.id).maybeSingle();
    if (!profile) return new Response(JSON.stringify({ error: "no profile" }), { status: 400, headers: corsHeaders });

    const slug = profile.current_room;
    const [{ data: room }, { data: npcs }, { data: events }, { data: loot }] = await Promise.all([
      admin.from("rooms").select("slug, name, description, ambience, kind, label, town_key").eq("slug", slug).maybeSingle(),
      admin.from("npcs").select("name, title, current_activity, is_aether, is_warden, is_merchant")
        .eq("room", slug).or(`dead_until.is.null,dead_until.lte.${new Date().toISOString()}`).limit(8),
      admin.from("world_events").select("kind, actor_name, target_name, created_at")
        .eq("room", slug).order("created_at", { ascending: false }).limit(4),
      admin.from("room_loot").select("gold, item_key, placed_by_name").eq("room", slug).limit(3),
    ]);

    if (!room) return new Response(JSON.stringify({ error: "no room" }), { status: 400, headers: corsHeaders });

    const npcSummary = (npcs ?? []).map((n: any) =>
      `${n.name}${n.title ? ` (${n.title})` : ""}${n.current_activity ? ` — ${n.current_activity}` : ""}`
    ).join("; ") || "no one of note";

    const eventSummary = (events ?? []).slice(0, 3).map((e: any) =>
      `${e.actor_name ?? "someone"} ${e.kind}${e.target_name ? ` ${e.target_name}` : ""}`
    ).join("; ") || "nothing recent";

    const lootSummary = (loot ?? []).length
      ? (loot ?? []).map((l: any) => l.gold ? `${l.gold}g on the ground` : `a ${l.item_key} dropped`).join(", ")
      : "";

    const playerBits: string[] = [];
    if (profile.race) playerBits.push(profile.race);
    if (profile.aether) playerBits.push(`sworn to ${profile.aether}`);
    if (profile.faction === "chaos") playerBits.push("of Chaos");
    if (profile.corruption > 30) playerBits.push("steeped in corruption");
    if (profile.hp < profile.max_hp / 3) playerBits.push("badly wounded");
    if (profile.merit > 100) playerBits.push("renowned");

    const INDOOR_KINDS = new Set(["tavern", "hall", "cave", "crypt", "tower", "temple", "loft", "room"]);
    const kind = (room.kind ?? "room") as string;
    const indoor = INDOOR_KINDS.has(kind);
    const settingRules = indoor
      ? `SETTING: INDOOR / enclosed (${kind}). The player is under a roof and walls. Allowed details: doors, hinges, lamps, candles, smoke, rafters, beams, hearths, floorboards, dust in light-shafts, mice, drafts under doors, things heard through walls. FORBIDDEN: open sky, distant horizons, wind across fields, weather hitting the player, gulls, crows wheeling overhead, sunlight on grass, dust devils.`
      : `SETTING: OUTDOOR / open (${kind}). The player is under sky. Allowed details: wind, weather, dust, light angles, distant sounds, birds, insects, animals, footing underfoot, far figures. FORBIDDEN: doors, hinges, rafters, beams, candles guttering on a hearth, lamp-flames leaning, things "in the next room" — there are no rooms here.`;

    const sys = `You write a SINGLE short ambient sentence (max 18 words) for a dark fantasy MUD.
Style: lowercase, no period at the end, sensory and concrete. No dialogue. No "you" actions. No second-person commands.
The line is ATMOSPHERE the player notices in this exact place at this exact moment. It must feel inevitable for *this* room and *this* player — never generic. Vary the sense (sight, smell, sound, touch, the uncanny). Sometimes weave in a present NPC by name doing a tiny piece of business. Reference the player's situation only obliquely (a wound aches, a sworn glyph stings, the corrupt taste copper, etc.) and rarely.
${settingRules}
NEVER repeat the recent lines. NEVER restate what the room description already says. Output only the line itself, no quotes, no prefix.`;

    const usr = `Place: ${room.label ?? "Place"} — ${room.name} (${kind}, ${indoor ? "indoor" : "outdoor"})
Room: ${room.description}${room.ambience ? `\nFixed ambience: ${room.ambience}` : ""}
Time: ${timeBucket()}
Present: ${npcSummary}
Recent events here: ${eventSummary}
${lootSummary ? `On the floor: ${lootSummary}\n` : ""}Player: ${profile.username}${playerBits.length ? `, ${playerBits.join(", ")}` : ""}${profile.char_description ? ` — ${profile.char_description.slice(0, 120)}` : ""}
Recent ambient lines (DO NOT REPEAT, DO NOT ECHO):
${recent.map(r => `- ${r}`).join("\n") || "- (none)"}

Write one fresh ambient line, obeying the SETTING rules above.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [{ role: "system", content: sys }, { role: "user", content: usr }],
        temperature: 1.05,
        max_tokens: 60,
      }),
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("ai gateway", aiRes.status, t);
      return new Response(JSON.stringify({ error: "ai", status: aiRes.status }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const j = await aiRes.json();
    let line: string = j?.choices?.[0]?.message?.content?.trim() ?? "";
    line = line.replace(/^["'*\-\s]+|["'*.\s]+$/g, "");
    if (!line) return new Response(JSON.stringify({ line: null }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    return new Response(JSON.stringify({ line }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
