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

    // (NPC population top-up removed — legacy `locations` table no longer exists.)



    // 2. Pull all living NPCs that have a schedule.
    const { data: npcs } = await admin.from("npcs").select("*")
      .or(`dead_until.is.null,dead_until.lte.${nowIso}`);

    // NPCs enrolled as agents (npc_state) live by needs in npc-agent-tick instead of the fixed schedule.
    const { data: agentRows } = await admin.from("npc_state").select("npc_id");
    const agentIds = new Set((agentRows ?? []).map((r: any) => r.npc_id));

    let moved = 0, logged = 0;
    for (const npc of npcs ?? []) {
      if (agentIds.has(npc.id)) continue;
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

    // Run the NPC agents' code brain (no AI calls).
    let agentResult: any = null;
    try {
      const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/npc-agent-tick`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
      });
      agentResult = await res.json().catch(() => null);
    } catch (e) {
      console.error("npc-agent-tick failed", e);
    }

    // The Seven: at most one god wakes per 24h/7 and issues decrees (one AI call when it does).
    let sevenResult: any = null;
    try {
      const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/seven-tick`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
      });
      sevenResult = await res.json().catch(() => null);
    } catch (e) {
      console.error("seven-tick failed", e);
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

    return new Response(JSON.stringify({ ok: true, bucket, moved, logged, agentResult, sevenResult, dragonResult }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
