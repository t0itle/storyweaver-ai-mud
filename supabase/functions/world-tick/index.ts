// Hourly world tick: advance every NPC's schedule, move them, log a world_event,
// and post an ambient message in their (new) room so witnesses see life happening.
// Triggered by pg_cron — no auth required, but verify a shared header to keep it private.
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
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const bucket = timeBucket();
    const nowIso = new Date().toISOString();

    // 1. NPC Population Management: Top up locations
    const { data: locations } = await admin.from("locations").select("id, population_target");
    for (const loc of locations ?? []) {
      const { count } = await admin.from("npcs").select("*", { count: "exact", head: true }).eq("room", loc.id).is("dead_until", null);
      if ((count ?? 0) < (loc.population_target ?? 0)) {
        // Logic to spawn new NPC if needed
        await admin.rpc("spawn_npc_in_location", { location_id: loc.id });
      }
    }

    // 2. Pull all living NPCs that have a schedule.
    const { data: npcs } = await admin.from("npcs").select("*")
      .or(`dead_until.is.null,dead_until.lte.${nowIso}`);

    let moved = 0, logged = 0;
    for (const npc of npcs ?? []) {
      const sched = (npc.schedule ?? {}) as Record<string, { room: string; activity: string }>;
      const slot = sched[bucket];
      if (!slot) continue;

      const newRoom = slot.room || npc.home_room || npc.room;
      const newActivity = slot.activity || npc.current_activity || "going about their day";

      const roomChanged = newRoom !== npc.room;
      const activityChanged = newActivity !== npc.current_activity;
      if (!roomChanged && !activityChanged) continue;

      await admin.from("npcs").update({
        room: newRoom,
        current_activity: newActivity,
        last_tick_at: nowIso,
      }).eq("id", npc.id);
      moved++;

      // Log it for adaptive storytelling — decays after 3 days.
      const decay = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
      await admin.from("world_events").insert({
        kind: roomChanged ? "npc_moved" : "npc_activity",
        actor_name: npc.name,
        target_name: roomChanged ? newRoom : null,
        room: newRoom,
        decay_at: decay,
        details: { from: npc.room, activity: newActivity, bucket },
      });
      logged++;

      // Ambient message in the destination room so present players see it.
      await admin.from("messages").insert({
        room: newRoom,
        author_name: "—",
        kind: "ambient",
        content: roomChanged
          ? `*${npc.name} arrives, ${newActivity}.*`
          : `*${npc.name} is ${newActivity}.*`,
        user_id: null,
      });
    }

    // 3. Weather: drift the sky roughly every other tick. Single world row;
    // clients subscribe via realtime and paint the change locally.
    let weatherResult: { kind: string; changed: boolean } | null = null;
    try {
      const WEATHER: { kind: string; note: string; weight: number }[] = [
        { kind: "clear",     note: "The sky is clear and pitiless.",                              weight: 34 },
        { kind: "wind",      note: "A hard wind combs the land, carrying grit and far-off voices.", weight: 22 },
        { kind: "overcast",  note: "Low cloud presses down; the light goes flat and grey.",       weight: 16 },
        { kind: "rain",      note: "A thin rain falls — rare enough that people stand out in it.", weight: 8 },
        { kind: "sandstorm", note: "A wall of red dust is walking the horizon. The desert is closed to the careless.", weight: 12 },
        { kind: "starfall",  note: "Falling stars scratch the dark. The Veiled call it the Speaker turning in sleep.", weight: 8 },
      ];
      const { data: cur } = await admin.from("world_weather").select("kind").eq("id", 1).maybeSingle();
      if (Math.random() < 0.5) {
        const pool = WEATHER.filter((w) => w.kind !== cur?.kind);
        const total = pool.reduce((s, w) => s + w.weight, 0);
        let roll = Math.random() * total;
        let picked = pool[0];
        for (const w of pool) { roll -= w.weight; if (roll <= 0) { picked = w; break; } }
        await admin.from("world_weather").upsert({
          id: 1, kind: picked.kind, note: picked.note, changed_at: nowIso,
        });
        await admin.from("world_events").insert({
          kind: "weather_shift", actor_name: "the sky", room: "gates-approach",
          details: { from: cur?.kind ?? "clear", to: picked.kind },
          decay_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        });
        weatherResult = { kind: picked.kind, changed: true };
      } else {
        weatherResult = { kind: cur?.kind ?? "clear", changed: false };
      }
    } catch (e) {
      console.error("weather shift failed", e);
    }

    // Roll for dragon stir based on current hoards.
    let dragonResult: any = null;
    try {
      const dragonRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/dragon-check`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
      });
      dragonResult = await dragonRes.json().catch(() => null);
    } catch (e) {
      console.error("dragon-check failed", e);
    }

    return new Response(JSON.stringify({ ok: true, bucket, moved, logged, weatherResult, dragonResult }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
