// Deep-desert wander system.
// Triggered when a player walks a compass direction off the caravan road
// (or from the deep desert itself). Tracks depth + a scrambled bearing,
// occasionally lands them at a real desert landmark, more often deeper
// into the sands. Rare encounters; the desert mostly wants you alone.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Real desert landmarks the wanderer can stumble onto.
const LANDMARKS = [
  "skeleton-kiln",
  "whisper-stones",
  "vulture-spire",
  "salt-mirror",
  "mirage-wells",
  "forgotten-oasis",
  "wind-carved-arches",
  "ember-dunes",
  "sun-bleached-caravan",
  "bone-dunes",
];

// Roads back to civilization — only reachable when bearing is true.
const ROAD_RETURNS = ["caravan-road", "desert-verge"];

const FLAVOR_DEEPER = [
  "The dune you crested looks identical to the last one. And the one before.",
  "Sand swallows your footprints behind you. Even the wind seems indifferent.",
  "A long ridge of glass-fused sand glints in the wrong direction.",
  "You walk for what feels like an hour. The sun has not moved.",
  "The horizon offers only more horizon.",
  "You step over the sun-bleached ribcage of something that was never named.",
  "A pillar of dust rises in the distance, then sinks back into nothing.",
  "The heat distorts the air until even your hands look like a stranger's.",
];

const FLAVOR_LOST = [
  "You are no longer sure which way you came from.",
  "Your bearings slip. North feels like a rumor.",
  "You realize the sun is on the wrong side. Or you are.",
  "Some old part of your mind admits, quietly, that you are lost.",
];

const FLAVOR_MIRAGE = [
  "*A city of white towers shimmers on the horizon. You take three steps toward it. It is gone.*",
  "*You see a caravan ahead — bells, banners, water. When you reach the spot, only your own tracks remain.*",
  "*A pool of dark water lies in the hollow ahead. You kneel. It is sand the colour of water, and nothing else.*",
];

const FLAVOR_LANDMARK = [
  "The dunes part and you find, against all odds, a place you have heard of.",
  "Something solid breaks the sand-line ahead. A landmark. You are not the first to find it.",
  "You crest one final ridge and the desert offers up something real.",
];

const RARE_ENCOUNTERS = [
  "*A figure in dust-bleached rags watches you from the next ridge. By the time you blink, only their footprints remain — leading nowhere.*",
  "*A lone camel without a rider walks past you, unhurried, and is gone before you can call out.*",
  "*A buried bell, half-uncovered by the wind, gives a single muffled toll as you pass.*",
  "*You find a clay tablet pressed into the sand. Its glyphs are unfamiliar. By the time you look back, the wind has covered it again.*",
];

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = await req.json().catch(() => ({}));
    const dir = String(body?.direction ?? "").toLowerCase();
    if (!["north", "south", "east", "west"].includes(dir)) {
      return new Response(JSON.stringify({ error: "Direction must be north/south/east/west." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: profile } = await admin.from("profiles")
      .select("id, username, current_room, desert_depth, desert_bearing, desert_entered_from")
      .eq("id", user.id).maybeSingle();
    if (!profile) return new Response(JSON.stringify({ error: "no profile" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: roomRow } = await admin.from("rooms").select("kind, slug").eq("slug", profile.current_room).maybeSingle();
    if (!roomRow || (roomRow.kind !== "desert")) {
      return new Response(JSON.stringify({ error: "You can only stray off-path in the desert." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Track depth: each off-road step increments. Bearing scrambles past depth >=3.
    const fromRoom = profile.current_room;
    const newDepth = (profile.desert_depth ?? 0) + 1;
    const enteredFrom = profile.desert_entered_from ?? (fromRoom === "deep-desert" ? null : fromRoom);
    // bearing 0 = true, 1 = scrambled. Probability of being lost grows with depth.
    const lostChance = Math.min(0.85, 0.15 + newDepth * 0.12);
    const becameLost = Math.random() < lostChance;
    const newBearing = becameLost ? 1 : (profile.desert_bearing ?? 0);

    // Determine outcome.
    // - depth 1-2 with true bearing: 30% land at a real landmark, otherwise deep-desert.
    // - depth >=3: 12% landmark, 6% rare encounter, otherwise deep-desert.
    const r = Math.random();
    let arriveSlug = "deep-desert";
    let outcome: "deeper" | "landmark" | "mirage" | "encounter" | "found_road" = "deeper";
    let extraFlavor: string | null = null;

    if (newDepth <= 2 && !becameLost) {
      if (r < 0.30) {
        arriveSlug = pick(LANDMARKS.filter((s) => s !== fromRoom));
        outcome = "landmark";
      }
    } else {
      if (r < 0.10) {
        arriveSlug = pick(LANDMARKS.filter((s) => s !== fromRoom));
        outcome = "landmark";
      } else if (r < 0.16) {
        outcome = "encounter";
        extraFlavor = pick(RARE_ENCOUNTERS);
      } else if (r < 0.24) {
        outcome = "mirage";
        extraFlavor = pick(FLAVOR_MIRAGE);
      } else if (!becameLost && r > 0.92 && enteredFrom) {
        // Lucky: find the road back where you entered.
        arriveSlug = enteredFrom;
        outcome = "found_road";
      }
    }

    // Reset depth/bearing if we landed on a real place.
    const landed = arriveSlug !== "deep-desert";

    const updates: Record<string, unknown> = {
      current_room: arriveSlug,
      desert_depth: landed ? 0 : newDepth,
      desert_bearing: landed ? 0 : newBearing,
      desert_entered_from: landed ? null : enteredFrom,
    };
    await admin.from("profiles").update(updates).eq("id", user.id);

    // Companion follows
    const { data: full } = await admin.from("profiles").select("companion_npc_id").eq("id", user.id).maybeSingle();
    if (full?.companion_npc_id) {
      await admin.from("npcs").update({ room: arriveSlug }).eq("id", full.companion_npc_id);
    }

    // Departure note in old room
    await admin.from("messages").insert({
      room: fromRoom, author_name: "—", kind: "system",
      content: `${profile.username} walks off into the sand, ${dir}-ward.`, user_id: null,
    });

    // Arrival flavor in new room
    let arrival: string;
    if (outcome === "landmark") {
      arrival = `*${pick(FLAVOR_LANDMARK)}*`;
    } else if (outcome === "found_road") {
      arrival = `*The wind shifts and a familiar shape — a road, a marker — resolves out of the haze. ${profile.username} has found the way back.*`;
    } else if (outcome === "encounter") {
      arrival = extraFlavor!;
    } else if (outcome === "mirage") {
      arrival = extraFlavor!;
    } else {
      arrival = `*${pick(FLAVOR_DEEPER)}*${becameLost && !profile.desert_bearing ? `\n\n*${pick(FLAVOR_LOST)}*` : ""}`;
    }
    await admin.from("messages").insert({
      room: arriveSlug, author_name: "—", kind: "ambient",
      content: arrival, user_id: null,
    });

    return new Response(JSON.stringify({
      ok: true,
      arrived: arriveSlug,
      outcome,
      depth: landed ? 0 : newDepth,
      lost: becameLost && !landed,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
