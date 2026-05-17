// Lichen King multi-step quest chain.
// Actions: list | advance
// Must be in the Lichen King's room (lichen-king) and Moss-Voice must be alive.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const KING_ROOM = "lichen-king";
const KING_NAME = "Moss-Voice";
const CROWN_KEY = "lichen-crown";
const FAR_VISIT_ROOM = "ashen-foothills"; // a far wild room
const FAR_VISIT_NAME = "The Ashen Foothills";

// Four canonical steps. Each step is "complete" when its check returns true; player
// must `advance` while in the King's grove to lock it in.
const STEPS = [
  {
    index: 1,
    title: "First Tongue",
    objective: "Answer one of Moss-Voice's riddles.",
    flavor: "He will know you can speak before he speaks long with you.",
    reward_gold: 30, reward_xp: 60, reward_merit: 2,
  },
  {
    index: 2,
    title: "All Three Riddles",
    objective: "Answer all three of Moss-Voice's riddles.",
    flavor: "Three riddles, three doors. Walk through them and he will trust your tongue.",
    reward_gold: 80, reward_xp: 160, reward_merit: 4,
  },
  {
    index: 3,
    title: "The Silenced Grove",
    objective: `Walk to ${FAR_VISIT_NAME} and listen for the silence that took root there.`,
    flavor: "A grove fell quiet long ago. He wants to know if the silence still holds.",
    reward_gold: 120, reward_xp: 220, reward_merit: 6,
  },
  {
    index: 4,
    title: "A Voice Stilled",
    objective: "Silence one living thing — any kill — and return to the Lichen King.",
    flavor: "Even a slow king demands proof you can end a song. Return crowned in his sight.",
    reward_gold: 300, reward_xp: 500, reward_merit: 25,
    grants_item: CROWN_KEY,
  },
];

async function checkStep(admin: any, userId: string, step: number, startedAt: string): Promise<boolean> {
  if (step === 1) {
    const { count } = await admin.from("quests")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId).eq("kind", "riddle").eq("status", "complete")
      .eq("giver_npc_id", "6aa6b239-3b3d-4727-907a-70a6ca6e545b");
    return (count ?? 0) >= 1;
  }
  if (step === 2) {
    const { count } = await admin.from("quests")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId).eq("kind", "riddle").eq("status", "complete")
      .eq("giver_npc_id", "6aa6b239-3b3d-4727-907a-70a6ca6e545b");
    return (count ?? 0) >= 3;
  }
  if (step === 3) {
    // Has the player visited the far room since the chain started?
    const { count } = await admin.from("world_events")
      .select("*", { count: "exact", head: true })
      .eq("actor_id", userId).eq("kind", "discovered_room").eq("room", FAR_VISIT_ROOM);
    if ((count ?? 0) > 0) return true;
    // Or simply currently there.
    const { data: p } = await admin.from("profiles").select("current_room").eq("id", userId).maybeSingle();
    return p?.current_room === FAR_VISIT_ROOM;
  }
  if (step === 4) {
    const { count } = await admin.from("world_events")
      .select("*", { count: "exact", head: true })
      .eq("actor_id", userId).eq("kind", "npc_killed")
      .gte("created_at", startedAt);
    return (count ?? 0) >= 1;
  }
  return false;
}

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
    const action = (body?.action ?? "list") as "list" | "advance";

    const { data: profile } = await admin.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (!profile) return json({ error: "no profile" }, 404);

    // Bootstrap progress row (started on first list/advance call).
    let { data: prog } = await admin.from("lichen_king_progress")
      .select("*").eq("user_id", user.id).maybeSingle();
    if (!prog) {
      const ins = await admin.from("lichen_king_progress")
        .insert({ user_id: user.id, step: 0, status: "active" })
        .select("*").maybeSingle();
      prog = ins.data;
    }

    const isCrowned = prog!.status === "crowned";
    const currentIndex = Math.min((prog!.step ?? 0) + 1, STEPS.length);
    const currentStep = STEPS.find((s) => s.index === currentIndex) ?? null;

    if (action === "list") {
      const canAdvance = !isCrowned && currentStep
        ? await checkStep(admin, user.id, currentStep.index, prog!.started_at)
        : false;
      return json({
        progress: prog,
        steps: STEPS,
        current_step: isCrowned ? null : currentStep,
        canAdvance,
        crowned: isCrowned,
        king_room: KING_ROOM,
      });
    }

    // ADVANCE
    if (isCrowned) return json({ error: "You already wear the Crown of the Lichen King." }, 400);
    if (!currentStep) return json({ error: "There is no further step." }, 400);
    if (profile.current_room !== KING_ROOM)
      return json({ error: `${KING_NAME} must hear your voice in his grove.` }, 400);

    const { data: king } = await admin.from("npcs")
      .select("id, dead_until").eq("name", KING_NAME).eq("room", KING_ROOM).maybeSingle();
    if (!king) return json({ error: `${KING_NAME} is not here.` }, 400);
    if (king.dead_until && new Date(king.dead_until) > new Date())
      return json({ error: `${KING_NAME} is silent.` }, 400);

    const okStep = await checkStep(admin, user.id, currentStep.index, prog!.started_at);
    if (!okStep) return json({ error: `You have not yet completed: ${currentStep.objective}` }, 400);

    const isFinal = currentStep.index >= STEPS.length;
    await admin.from("lichen_king_progress").update({
      step: currentStep.index,
      status: isFinal ? "crowned" : "active",
      completed_at: isFinal ? new Date().toISOString() : prog!.completed_at,
      updated_at: new Date().toISOString(),
    }).eq("user_id", user.id);

    // Rewards.
    const newGold = (profile.gold ?? 0) + (currentStep.reward_gold ?? 0);
    const newXp = (profile.xp ?? 0) + (currentStep.reward_xp ?? 0);
    const newMerit = (profile.merit ?? 0) + (currentStep.reward_merit ?? 0);
    await admin.from("profiles").update({ gold: newGold, xp: newXp, merit: newMerit }).eq("id", user.id);

    // Final step grants the Crown — uniquely. Skip if already owned.
    let grantedCrown = false;
    if (isFinal && (currentStep as any).grants_item) {
      const key = (currentStep as any).grants_item as string;
      const { count } = await admin.from("player_items")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id).eq("item_key", key);
      if ((count ?? 0) === 0) {
        await admin.from("player_items").insert({ user_id: user.id, item_key: key, quantity: 1 });
        grantedCrown = true;
      }
    }

    await admin.from("messages").insert({
      room: KING_ROOM, user_id: null, author_name: "—", kind: "system",
      content: isFinal
        ? `🌿 The Lichen King exhales a slow breath of spores. **${profile.username}** kneels${grantedCrown ? `, and the **Crown of the Lichen King** is given.` : `. The crown already rests upon their brow.`}`
        : `🌿 Moss-Voice creaks once in approval — **${profile.username}** completes *${currentStep.title}*.`,
    });

    await admin.from("world_events").insert({
      kind: isFinal ? "lichen_king_crowned" : "lichen_king_step",
      actor_id: user.id, actor_name: profile.username,
      room: KING_ROOM, target_kind: "npc", target_name: KING_NAME,
      details: { step: currentStep.index, title: currentStep.title, item: grantedCrown ? CROWN_KEY : null },
    });

    return json({ ok: true, completed_step: currentStep.index, isFinal, grantedCrown });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "error" }, 500);
  }
});
