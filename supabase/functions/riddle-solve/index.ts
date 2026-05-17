// Submit an answer to your active riddle/puzzle quest.
// Normalizes both sides; reveals hint at 3 attempts; fails at 5.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const norm = (s: string) =>
  s.toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(the|a|an|of|is|are|am)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const matches = (guess: string, answer: string) => {
  const g = norm(guess), a = norm(answer);
  if (!g || !a) return false;
  if (g === a) return true;
  // Accept singular/plural sloppiness
  if (g + "s" === a || g === a + "s") return true;
  // Accept "answers" listed with " or " — any one wins
  if (a.split(/\s+or\s+/).some((alt) => alt.trim() === g)) return true;
  return false;
};

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

    const { answer, quest_id } = await req.json();
    if (!answer || typeof answer !== "string") return json({ error: "answer required" }, 400);

    const { data: profile } = await admin.from("profiles").select("username, current_room, xp, gold, merit")
      .eq("id", user.id).maybeSingle();
    if (!profile) return json({ error: "no profile" }, 404);

    // Find target quest
    let q;
    if (quest_id) {
      const { data } = await admin.from("quests").select("*").eq("id", quest_id).eq("user_id", user.id).maybeSingle();
      q = data;
    } else {
      const { data } = await admin.from("quests").select("*")
        .eq("user_id", user.id).eq("kind", "riddle").eq("status", "active")
        .order("accepted_at", { ascending: false }).limit(1).maybeSingle();
      q = data;
    }
    if (!q) return json({ error: "you carry no riddle to solve" }, 404);
    if (q.status !== "active") return json({ error: "that riddle is already settled" }, 400);
    if (!q.solution) return json({ error: "this quest has no answer to give" }, 400);

    const ok = matches(answer, q.solution);

    if (ok) {
      const goldNext = (profile.gold ?? 0) + (q.reward_gold ?? 0);
      const xpNext = (profile.xp ?? 0) + (q.reward_xp ?? 0);
      const meritGain = Math.max(0, Math.min(20, (q.reward_amity ?? 0)));
      const meritNext = (profile.merit ?? 0) + meritGain;

      await admin.from("quests").update({
        status: "complete", completed_at: new Date().toISOString(),
      }).eq("id", q.id);
      await admin.from("profiles").update({ gold: goldNext, xp: xpNext, merit: meritNext }).eq("id", user.id);

      // Amity with the giver
      const { data: amity } = await admin.from("npc_amity").select("score")
        .eq("user_id", user.id).eq("npc_id", q.giver_npc_id).maybeSingle();
      const next = Math.max(-100, Math.min(100, (amity?.score ?? 0) + (q.reward_amity ?? 0)));
      await admin.from("npc_amity").upsert({
        user_id: user.id, npc_id: q.giver_npc_id, score: next, updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,npc_id" });

      await admin.from("messages").insert({
        room: profile.current_room, user_id: null, author_name: q.giver_npc_name, kind: "say",
        content: `Yes — **${q.solution}**. You have the shape of it. *(+${q.reward_gold ?? 0}g, +${q.reward_xp ?? 0}xp${meritGain ? `, +${meritGain} merit` : ""})*`,
        npc_id: q.giver_npc_id,
      });
      await admin.from("world_events").insert({
        kind: "quest_completed", actor_id: user.id, actor_name: profile.username,
        room: profile.current_room,
        details: { title: q.title, giver: q.giver_npc_name, note: `Answered "${q.solution}"` },
      });

      return json({ ok: true, correct: true, answer: q.solution,
        reward: { gold: q.reward_gold, xp: q.reward_xp, merit: meritGain } });
    }

    // Wrong
    const attempts = (q.attempts ?? 0) + 1;
    const remaining = Math.max(0, 5 - attempts);

    if (attempts >= 5) {
      await admin.from("quests").update({ status: "failed", attempts }).eq("id", q.id);
      await admin.from("messages").insert({
        room: profile.current_room, user_id: null, author_name: q.giver_npc_name, kind: "say",
        content: `No more guesses. The answer was **${q.solution}**. Come back when your wits are sharper.`,
        npc_id: q.giver_npc_id,
      });
      return json({ ok: true, correct: false, failed: true, answer: q.solution });
    }

    await admin.from("quests").update({ attempts }).eq("id", q.id);
    const reveal = attempts >= 3 && q.solution_hint;

    await admin.from("messages").insert({
      room: profile.current_room, user_id: null, author_name: q.giver_npc_name, kind: "say",
      content: reveal
        ? `That is not the shape of it. Try again — *hint:* ${q.solution_hint} *(${remaining} guess${remaining === 1 ? "" : "es"} left)*`
        : `Not quite. *(${remaining} guess${remaining === 1 ? "" : "es"} left)*`,
      npc_id: q.giver_npc_id,
    });

    return json({ ok: true, correct: false, attempts, remaining, hint: reveal ? q.solution_hint : null });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "error" }, 500);
  }
});
