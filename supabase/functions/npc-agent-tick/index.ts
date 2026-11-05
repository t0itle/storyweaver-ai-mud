// NPC agent tick: runs the code brain (_shared/npcMind.ts) for every enrolled NPC that is due.
// No AI calls. Called by world-tick with the service-role key. See docs/npc-agents.md.
//
// Per NPC: decay needs → choose an action by utility → move/act → update purse, mood and wants →
// journal new wants → (phase 3) turn wants into quests or letters → bark if a player can see it.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  applyAction, barkFor, bucketAt, chooseAction, coinNeedFromPurse, decayNeeds, DEFAULT_NEEDS,
  deriveWants, moodFor, traitsFor, type Action, type Needs, type Traits, type Want,
} from "../_shared/npcMind.ts";
import { pursueWants } from "./wants.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const BATCH = 300;                 // NPCs per tick (keeps the function well inside its time limit)
const THINK_EVERY_MIN = 50;        // next_think_at spacing; world-tick runs hourly
const ACTIVITY: Record<Action, string> = {
  work: "at work", eat: "taking a meal", sleep: "asleep", socialize: "passing the time with company",
  pray: "at prayer", keep_watch: "keeping watch",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (req.headers.get("Authorization") !== `Bearer ${serviceKey}`) return json({ error: "forbidden" }, 403);

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
    const now = new Date();
    const nowIso = now.toISOString();
    const bucket = bucketAt(now);

    const { data: due } = await admin.from("npc_state")
      .select("*, npcs(id, name, title, persona, greeting, room, home_room, schedule, purse_gold, is_guard, is_warden, hidden, dead_until)")
      .lte("next_think_at", nowIso).order("next_think_at").limit(BATCH);
    const rows = (due ?? []).filter((r: any) =>
      r.npcs && !r.npcs.hidden && !(r.npcs.dead_until && r.npcs.dead_until > nowIso));
    if (!rows.length) return json({ ok: true, processed: 0 });

    // World lookups, once per tick.
    const [{ data: rooms }, { data: souls }, { data: present }, { data: bound }] = await Promise.all([
      admin.from("rooms").select("slug, name, kind, town_key"),
      admin.from("npc_souls").select("npc_id, core").in("npc_id", rows.map((r: any) => r.npc_id)),
      admin.from("profiles").select("current_room").not("current_room", "is", null),
      admin.from("profiles").select("companion_npc_id, escortee_npc_id")
        .or("companion_npc_id.not.is.null,escortee_npc_id.not.is.null"),
    ]);
    // Companions and escorted travellers go where their player goes; the tick must not move them.
    const following = new Set<string>();
    for (const p of bound ?? []) { if (p.companion_npc_id) following.add(p.companion_npc_id); if (p.escortee_npc_id) following.add(p.escortee_npc_id); }
    const roomBySlug = new Map((rooms ?? []).map((r: any) => [r.slug, r]));
    const tavernByTown = new Map<string, string>();
    for (const r of rooms ?? []) if (r.kind === "tavern" && r.town_key && !tavernByTown.has(r.town_key)) tavernByTown.set(r.town_key, r.slug);
    const soulById = new Map((souls ?? []).map((s: any) => [s.npc_id, s.core]));
    const occupied = new Set((present ?? []).map((p: any) => p.current_room));
    const barkedRooms = new Set<string>();

    // Lazily create souls (background + voice from the existing persona, stable traits from the id).
    const newSouls = rows.filter((r: any) => !soulById.has(r.npc_id)).map((r: any) => ({
      npc_id: r.npc_id,
      core: { background: r.npcs.persona, voice: r.npcs.greeting ?? null, traits: traitsFor(r.npc_id) },
    }));
    if (newSouls.length) {
      await admin.from("npc_souls").upsert(newSouls, { onConflict: "npc_id", ignoreDuplicates: true });
      for (const s of newSouls) soulById.set(s.npc_id, s.core);
    }

    let moved = 0, barks = 0, newWants = 0;
    for (const st of rows as any[]) {
      const npc = st.npcs;
      const traits: Traits = soulById.get(st.npc_id)?.traits ?? traitsFor(st.npc_id);
      const hours = st.last_tick_at
        ? Math.min(6, Math.max(0, (now.getTime() - new Date(st.last_tick_at).getTime()) / 3_600_000))
        : 1;

      let needs: Needs = decayNeeds({ ...DEFAULT_NEEDS, ...(st.needs ?? {}) }, hours);
      let purse: number = npc.purse_gold ?? 0;
      needs.coin = coinNeedFromPurse(purse);

      const action = chooseAction({ needs, traits, bucket, isGuard: npc.is_guard || npc.is_warden, purse });
      const applied = applyAction(action, needs, purse);
      needs = applied.needs;
      purse = Math.max(0, purse + applied.goldDelta);
      needs.coin = coinNeedFromPurse(purse);

      // Where the action happens. The schedule stays the NPC's routine; needs bend it.
      const home = roomBySlug.has(npc.home_room) ? npc.home_room : npc.room;
      const slot = (npc.schedule ?? {})[bucket] as { room?: string; activity?: string } | undefined;
      const routineRoom = slot?.room && roomBySlug.has(slot.room) ? slot.room : home;
      const town = roomBySlug.get(home)?.town_key;
      let room = following.has(npc.id) ? npc.room : routineRoom;
      if (!following.has(npc.id)) {
        if (action === "sleep") room = home;
        if ((action === "eat" || action === "socialize") && town && tavernByTown.has(town)) room = tavernByTown.get(town)!;
      }
      const activity = action === "work" && slot?.activity ? slot.activity : ACTIVITY[action];
      const roomChanged = room !== npc.room;

      await admin.from("npcs").update({
        room, current_activity: activity, purse_gold: purse, last_tick_at: nowIso,
      }).eq("id", npc.id);

      if (roomChanged) {
        moved++;
        await admin.from("world_events").insert({
          kind: "npc_moved", actor_name: npc.name, target_name: room, room,
          decay_at: new Date(now.getTime() + 3 * 86_400_000).toISOString(),
          details: { from: npc.room, activity, bucket, action },
        });
      }

      // Wants: journal the new ones, then let phase-3 logic try to get help.
      const prevWants: Want[] = st.wants ?? [];
      // deriveWants returns the previous object for a persisting want, so its posted_quest_id etc. survive.
      let wants = deriveWants(needs, prevWants, nowIso);
      const fresh = wants.filter((w) => !prevWants.some((p) => p.need === w.need));
      if (fresh.length) {
        newWants += fresh.length;
        await admin.from("npc_journal").insert(fresh.map((w) => ({
          npc_id: npc.id, kind: "want", subject_kind: "self", summary: w.text,
          importance: 3, disclosure: 1, room,
        })));
      }
      wants = await pursueWants(admin, { npc: { ...npc, room, purse_gold: purse }, wants, roomBySlug, now });

      // Barks: only where a player can see them, at most one per room per tick.
      if (occupied.has(room) && !barkedRooms.has(room)) {
        barkedRooms.add(room);
        barks++;
        await admin.from("messages").insert({
          room, user_id: null, author_name: "—", kind: "ambient",
          content: roomChanged ? `*${npc.name} arrives, ${activity}.*` : barkFor(npc.name, action, needs, now.getUTCHours()),
        });
      }

      const mood = moodFor(needs);
      const goals = (st.goals ?? []).filter((g: any) => !g.until || g.until > nowIso); // a god's charge lasts its term
      await admin.from("npc_state").update({
        needs, wants, goals, mood: mood.mood, mood_intensity: mood.intensity, current_action: action,
        last_tick_at: nowIso, updated_at: nowIso,
        next_think_at: new Date(now.getTime() + THINK_EVERY_MIN * 60_000).toISOString(),
      }).eq("npc_id", npc.id);
    }

    return json({ ok: true, processed: rows.length, moved, barks, new_wants: newWants });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "error" }, 500);
  }
});
