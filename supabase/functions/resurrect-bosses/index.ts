// Scheduled tick: turn any due `pending_resurrections` into a bone-dragon + necromancer pair.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const nowIso = new Date().toISOString();

  const { data: due } = await admin.from("pending_resurrections")
    .select("*").eq("status", "pending").lte("resurrect_at", nowIso).limit(10);

  let raised = 0;
  for (const pr of due ?? []) {
    // 1) Spawn the necromancer in the same lair.
    const { data: necro, error: necroErr } = await admin.from("npcs").insert({
      name: pr.necromancer_name,
      title: pr.necromancer_title,
      persona: pr.necromancer_persona,
      room: pr.room,
      home_room: pr.room,
      is_boss: true,
      combat_max_hp: pr.necromancer_max_hp,
      combat_damage_min: pr.necromancer_damage_min,
      combat_damage_max: pr.necromancer_damage_max,
      boss_intro: `A pale man in patched grey looks up from a circle of chalk and teeth. "${pr.original_name} is mine now," he says, almost gently. "And so are you."`,
      boss_reward_gold: 600,
      boss_reward_xp: 800,
      boss_reward_merit: 60,
      greeting: "Do not interrupt the binding. The bones still want to wander.",
    }).select().single();
    if (necroErr || !necro) continue;

    // 2) Revive original NPC as the bone form, sustained by the necromancer.
    await admin.from("npcs").update({
      name: pr.new_name,
      title: pr.new_title,
      persona: pr.new_persona,
      is_boss: true,
      combat_max_hp: pr.new_max_hp,
      combat_damage_min: pr.new_damage_min,
      combat_damage_max: pr.new_damage_max,
      boss_intro: pr.new_boss_intro,
      boss_reward_gold: 6000,
      boss_reward_xp: 3500,
      boss_reward_merit: 220,
      dead_until: null,
      sustained_by_npc_id: necro.id,
    }).eq("id", pr.original_npc_id);

    // 3) World-wide rumor.
    const line = `✶ A wind from the old hoard carries word: **${pr.original_name}** walks again, bound in bone and grave-silk. A pale stitcher hums behind it.`;
    const { data: rooms } = await admin.from("rooms").select("slug");
    if (rooms) {
      for (let i = 0; i < rooms.length; i += 200) {
        const rows = rooms.slice(i, i + 200).map((r: any) => ({
          room: r.slug, user_id: null, author_name: "—", kind: "system", content: line,
        }));
        await admin.from("messages").insert(rows);
      }
    }

    await admin.from("world_events").insert({
      room: pr.room, kind: "dragon_stirs",
      target_kind: "npc", target_id: pr.original_npc_id, target_name: pr.new_name,
      details: { resurrected: true, by: pr.necromancer_name },
      decay_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    });

    await admin.from("pending_resurrections").update({
      status: "raised", processed_at: nowIso,
    }).eq("id", pr.id);
    raised++;
  }

  return new Response(JSON.stringify({ ok: true, raised, checked: due?.length ?? 0 }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
