// Player asks an NPC for a riddle. Server picks an unsolved one from puzzle_pool
// and creates a kind='riddle' quest with the answer stored server-side.
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

    const { npc_id } = await req.json();
    if (!npc_id) return json({ error: "npc_id required" }, 400);

    const { data: profile } = await admin.from("profiles").select("username, current_room").eq("id", user.id).maybeSingle();
    if (!profile) return json({ error: "no profile" }, 404);

    const { data: npc } = await admin.from("npcs").select("id, name, room, dead_until")
      .eq("id", npc_id).maybeSingle();
    if (!npc) return json({ error: "no such soul" }, 404);
    if (npc.room !== profile.current_room) return json({ error: `${npc.name} is not here.` }, 400);
    if (npc.dead_until && new Date(npc.dead_until) > new Date()) return json({ error: `${npc.name} cannot speak.` }, 400);

    // Already have an active or offered riddle from this NPC?
    const { data: existing } = await admin.from("quests").select("id, status, title, objective")
      .eq("user_id", user.id).eq("giver_npc_id", npc_id).eq("kind", "riddle")
      .in("status", ["offered", "active"]).maybeSingle();
    if (existing) {
      return json({ ok: true, existing: true, quest_id: existing.id, title: existing.title, prompt: existing.objective });
    }

    // Pick a puzzle the player hasn't already solved.
    const { data: pool } = await admin.from("puzzle_pool").select("*").eq("npc_id", npc_id);
    if (!pool || pool.length === 0) return json({ error: `${npc.name} has no riddle in mind today.` }, 400);

    const { data: solved } = await admin.from("quests").select("title")
      .eq("user_id", user.id).eq("giver_npc_id", npc_id).eq("kind", "riddle").eq("status", "complete");
    const solvedTitles = new Set((solved ?? []).map((q: any) => q.title));
    const fresh = pool.filter((p: any) => !solvedTitles.has(`${p.kind === "puzzle" ? "Puzzle" : "Riddle"}: ${p.prompt.slice(0, 40)}…`));
    const pick = (fresh.length > 0 ? fresh : pool)[Math.floor(Math.random() * (fresh.length > 0 ? fresh.length : pool.length))];

    const title = `${pick.kind === "puzzle" ? "Puzzle" : "Riddle"}: ${pick.prompt.slice(0, 40)}…`;

    const { data: quest, error } = await admin.from("quests").insert({
      user_id: user.id,
      giver_npc_id: npc.id,
      giver_npc_name: npc.name,
      title,
      description: pick.flavor || `${npc.name} sets you a ${pick.kind}.`,
      objective: pick.prompt,
      status: "active",                       // riddles activate immediately
      severity: pick.severity ?? "standard",
      kind: "riddle",
      target_kind: null,
      target_ref: null,
      reward_gold: pick.reward_gold,
      reward_xp: pick.reward_xp,
      reward_amity: Math.min(10, Math.max(2, Math.round((pick.reward_merit ?? 4) / 2))),
      reward_item_key: pick.reward_item_key,
      reward_rune_key: pick.reward_rune_key,
      offered_room: profile.current_room,
      accepted_at: new Date().toISOString(),
      solution: pick.answer,
      solution_hint: pick.hint,
      attempts: 0,
    }).select("*").maybeSingle();

    if (error) return json({ error: error.message }, 500);

    await admin.from("messages").insert({
      room: profile.current_room, user_id: null, author_name: npc.name, kind: "say",
      content: `${pick.flavor ? pick.flavor + " " : ""}"${pick.prompt}"  ·  *(type:  solve <your answer>)*`,
      npc_id: npc.id,
    });

    return json({
      ok: true,
      quest_id: quest!.id,
      title,
      prompt: pick.prompt,
      severity: pick.severity,
    });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "error" }, 500);
  }
});
