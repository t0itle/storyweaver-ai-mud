// Walk the 7-step Light vow chain for a player's chosen Aether.
// Actions: list | advance | claim
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Unauthorized" }, 401);
    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } });
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const action = (body?.action ?? "list") as "list" | "advance" | "claim";

    const { data: profile } = await admin.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (!profile) return json({ error: "no profile" }, 400);
    if (profile.faction !== "aether" || !profile.aether)
      return json({ error: "You are not sworn to any Aether." }, 400);

    const aetherKey = profile.aether as string;
    const { data: aether } = await admin.from("aethers").select("*").eq("key", aetherKey).maybeSingle();
    if (!aether) return json({ error: "Aether not found." }, 400);

    // Ensure a loyalty row exists.
    let { data: loyalty } = await admin.from("aether_loyalty")
      .select("*").eq("user_id", user.id).eq("aether_key", aetherKey).maybeSingle();
    if (!loyalty) {
      const ins = await admin.from("aether_loyalty")
        .insert({ user_id: user.id, aether_key: aetherKey, step: 0, status: "active" })
        .select("*").maybeSingle();
      loyalty = ins.data;
    }

    const { data: steps } = await admin.from("aether_quest_steps")
      .select("*").eq("aether_key", aetherKey).order("step_index");
    const allSteps = steps ?? [];
    const TOTAL = allSteps.length; // 7

    const currentStep = Math.min(loyalty!.step + 1, TOTAL);
    const stepRow = allSteps.find((s) => s.step_index === currentStep);

    if (action === "list") {
      return json({
        loyalty,
        aether,
        steps: allSteps,
        current_step: loyalty!.status === "devout" ? null : currentStep,
        current: loyalty!.status === "devout" ? null : stepRow,
        canAdvance: loyalty!.status === "active" && stepRow
          ? await checkStep(admin, user.id, profile, aether, stepRow)
          : false,
      });
    }

    if (loyalty!.status !== "active") return json({ error: "Your vow is already complete." }, 400);
    if (!stepRow) return json({ error: "No step to advance." }, 400);

    if (action === "advance") {
      const ok = await checkStep(admin, user.id, profile, aether, stepRow);
      if (!ok) return json({ error: `You have not yet completed: ${stepRow.objective}` }, 400);

      // Award rewards.
      const isFinal = currentStep >= TOTAL;
      const newStatus = isFinal ? "devout" : "active";
      await admin.from("aether_loyalty").update({
        step: currentStep,
        status: newStatus,
        completed_at: isFinal ? new Date().toISOString() : loyalty!.completed_at,
        updated_at: new Date().toISOString(),
      }).eq("user_id", user.id).eq("aether_key", aetherKey);

      const newGold = (profile.gold ?? 0) + (stepRow.reward_gold ?? 0);
      const newXp   = (profile.xp ?? 0) + (stepRow.reward_xp ?? 0);
      const newMerit= (profile.merit ?? 0) + (stepRow.reward_merit ?? 0);
      await admin.from("profiles").update({ gold: newGold, xp: newXp, merit: newMerit }).eq("id", user.id);

      // World event → journal entry.
      await admin.from("world_events").insert({
        kind: isFinal ? "aether_vow_complete" : "aether_vow_step",
        actor_id: user.id, actor_name: profile.username,
        room: profile.current_room, target_kind: "aether", target_name: aetherKey,
        details: { aether: aetherKey, step: currentStep, title: stepRow.title, flavor: stepRow.flavor },
      });

      // Local ambient.
      await admin.from("messages").insert({
        room: profile.current_room, user_id: null, author_name: "—", kind: "system",
        content: isFinal
          ? `**${profile.username}** speaks the final Vow of **${aether.name}**. The room hums. They are *Devout*.`
          : `**${profile.username}** fulfills a charge of **${aether.name}**: *${stepRow.title}*.`,
      });

      return json({ ok: true, completed_step: currentStep, isFinal });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "error" }, 500);
  }
});

// Per-step server-side validation.
async function checkStep(
  admin: ReturnType<typeof createClient>,
  userId: string,
  profile: { current_room: string; aether_chosen_at?: string | null },
  aether: { key: string; throne_room: string | null; well_room: string | null },
  step: { step_index: number; themed_rune_key: string | null; reward_artifact_key: string | null },
): Promise<boolean> {
  const since = profile.aether_chosen_at ?? new Date(0).toISOString();
  switch (step.step_index) {
    case 1: // In throne room
      return profile.current_room === aether.throne_room;
    case 2: { // Visit any room belonging to the Aether's kingdom (heuristic: same town_key as well_room).
      // Get well_room's town_key, then check current_room shares it.
      const { data: well } = await admin.from("rooms").select("town_key").eq("slug", aether.well_room).maybeSingle();
      if (!well?.town_key) return false;
      const { data: cur } = await admin.from("rooms").select("town_key").eq("slug", profile.current_room).maybeSingle();
      return cur?.town_key === well.town_key;
    }
    case 3: { // Learned themed rune
      if (!step.themed_rune_key) return true;
      const { count } = await admin.from("player_lesser_rune_knowledge")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId).eq("rune_key", step.themed_rune_key).eq("knows_symbol", true);
      return (count ?? 0) > 0;
    }
    case 4: { // ≥1 npc kill since taking the vow
      const { count } = await admin.from("world_events")
        .select("*", { count: "exact", head: true })
        .eq("actor_id", userId).eq("kind", "npc_killed").gte("created_at", since);
      return (count ?? 0) >= 1;
    }
    case 5: { // Discovered ≥3 wardens of this Aether
      const { data: wardens } = await admin.from("npcs")
        .select("id").eq("aether_key", aether.key).eq("is_warden", true);
      const ids = (wardens ?? []).map((w: { id: string }) => w.id);
      if (ids.length === 0) return false;
      const { count } = await admin.from("player_npc_discoveries")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId).in("npc_id", ids);
      return (count ?? 0) >= 3;
    }
    case 6: { // Possess the artifact AND be in throne
      if (profile.current_room !== aether.throne_room) return false;
      if (!step.reward_artifact_key) return true;
      const { count } = await admin.from("player_speaker_artifacts")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId).eq("artifact_key", step.reward_artifact_key);
      return (count ?? 0) > 0;
    }
    case 7: // Speak final vow in throne
      return profile.current_room === aether.throne_room;
    default:
      return false;
  }
}
