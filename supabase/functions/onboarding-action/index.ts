// First Steps — a short teaching chain for new walkers. Each step is validated
// server-side against things the player has actually done, so the checklist
// doubles as a tour of the systems that keep you alive (especially ✚ Sana).
// Actions: list | advance | dismiss
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

interface Step {
  index: number;
  title: string;
  objective: string;
  hint: string;
}

const STEPS: Step[] = [
  {
    index: 1, title: "Find Your Voice",
    objective: "Speak — say something aloud, or ask a soul a question.",
    hint: "Type `say hello`, or `ask <name> <question>` to any soul standing near you.",
  },
  {
    index: 2, title: "The Last Breath",
    objective: "Learn both the word and the shape of ✚ Sana, the rune that holds off death.",
    hint: "Seek healers, scholars, and shrines. Without ✚ Sana, falling in battle is permanent.",
  },
  {
    index: 3, title: "First Blood",
    objective: "Win a fight — strike down any hostile creature.",
    hint: "Type `attack <name>`. The roads and wilds will offer you trouble soon enough.",
  },
  {
    index: 4, title: "The First City",
    objective: "Reach the First City and pass under the seven sigils.",
    hint: "Follow the roads, use the map, or hire a wagon. The Hall of Choosing waits inside.",
  },
];

const FINAL_GOLD = 50;
const FINAL_XP = 100;

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
    const action = (body?.action ?? "list") as "list" | "advance" | "dismiss";

    const { data: profile } = await admin.from("profiles")
      .select("username, current_room, gold, xp").eq("id", user.id).maybeSingle();
    if (!profile) return json({ error: "no profile" }, 400);

    let { data: prog } = await admin.from("onboarding_progress")
      .select("*").eq("user_id", user.id).maybeSingle();
    if (!prog) {
      const ins = await admin.from("onboarding_progress")
        .insert({ user_id: user.id, step: 0, status: "active" }).select("*").maybeSingle();
      prog = ins.data;
    }

    if (action === "dismiss") {
      await admin.from("onboarding_progress")
        .update({ status: "dismissed", updated_at: new Date().toISOString() })
        .eq("user_id", user.id);
      return json({ ok: true, dismissed: true });
    }

    const currentIdx = Math.min((prog!.step ?? 0) + 1, STEPS.length);
    const step = STEPS.find((s) => s.index === currentIdx)!;
    const done = prog!.status !== "active";

    if (action === "list") {
      return json({
        progress: prog,
        steps: STEPS,
        current_step: done ? null : currentIdx,
        current: done ? null : step,
        canAdvance: done ? false : await checkStep(admin, user.id, profile.current_room, step),
      });
    }

    // advance
    if (done) return json({ error: "Your first steps are already behind you." }, 400);
    const ok = await checkStep(admin, user.id, profile.current_room, step);
    if (!ok) return json({ error: `Not yet: ${step.objective}` }, 400);

    const isFinal = step.index >= STEPS.length;
    await admin.from("onboarding_progress").update({
      step: step.index,
      status: isFinal ? "complete" : "active",
      completed_at: isFinal ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }).eq("user_id", user.id);

    if (isFinal) {
      await admin.from("profiles").update({
        gold: (profile.gold ?? 0) + FINAL_GOLD,
        xp: (profile.xp ?? 0) + FINAL_XP,
      }).eq("id", user.id);
      await admin.from("player_journal_entries").insert({
        user_id: user.id, kind: "onboarding_complete",
        title: "I learned how to stay alive in this world",
        body: "Voice, rune, blade, road. The desert did not take me in my first days — the rest is up to me.",
        room: profile.current_room,
      });
      await admin.from("messages").insert({
        room: profile.current_room, user_id: null, author_name: "—", kind: "system",
        addressed_to: user.id,
        content: `✦ Your first steps are complete. +${FINAL_GOLD}g, +${FINAL_XP}xp. The world is yours to walk.`,
      });
    }

    return json({ ok: true, completed_step: step.index, isFinal, reward: isFinal ? { gold: FINAL_GOLD, xp: FINAL_XP } : null });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "error" }, 500);
  }
});

async function checkStep(
  admin: ReturnType<typeof createClient>,
  userId: string,
  currentRoom: string,
  step: Step,
): Promise<boolean> {
  switch (step.index) {
    case 1: { // said anything, anywhere
      const { count } = await admin.from("messages")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId).in("kind", ["say", "emote"]);
      return (count ?? 0) > 0;
    }
    case 2: { // knows word AND symbol of sana
      const { data } = await admin.from("player_lesser_rune_knowledge")
        .select("knows_word, knows_symbol")
        .eq("user_id", userId).eq("rune_key", "sana").maybeSingle();
      return !!(data?.knows_word && data?.knows_symbol);
    }
    case 3: { // any npc kill
      const { count } = await admin.from("world_events")
        .select("*", { count: "exact", head: true })
        .eq("actor_id", userId).eq("kind", "npc_killed");
      return (count ?? 0) > 0;
    }
    case 4: { // stood in the First City
      if (currentRoom === "first-city" || currentRoom === "first-city-gate") return true;
      const { count } = await admin.from("player_room_visits")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId).in("room", ["first-city", "first-city-gate"]);
      return (count ?? 0) > 0;
    }
    default:
      return false;
  }
}
