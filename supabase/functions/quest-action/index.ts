// Quest lifecycle: accept | decline | abandon. Server-authoritative.
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

    const { quest_id, action } = await req.json();
    if (!quest_id || !["accept", "decline", "abandon"].includes(action))
      return json({ error: "quest_id and valid action required" }, 400);

    const { data: quest } = await admin.from("quests").select("*").eq("id", quest_id).eq("user_id", user.id).maybeSingle();
    if (!quest) return json({ error: "no such quest" }, 404);
    const { data: profile } = await admin.from("profiles").select("username, current_room").eq("id", user.id).maybeSingle();

    if (action === "accept") {
      if (quest.status !== "offered") return json({ error: "this quest is not on offer" }, 400);
      // Cap concurrent active quests per player.
      const { count } = await admin.from("quests").select("*", { count: "exact", head: true })
        .eq("user_id", user.id).eq("status", "active");
      if ((count ?? 0) >= 5) return json({ error: "you already carry too many promises (5 max)" }, 400);

      await admin.from("quests").update({
        status: "active",
        accepted_at: new Date().toISOString(),
      }).eq("id", quest_id);

      // Escort quests: bind the traveler to the player so they follow.
      if (quest.kind === "escort" && quest.escort_npc_id && quest.target_ref) {
        const { data: destRoom } = await admin.from("rooms")
          .select("name").eq("slug", quest.target_ref).maybeSingle();
        await admin.from("profiles").update({
          escortee_npc_id: quest.escort_npc_id,
          escortee_destination: quest.target_ref,
          escortee_destination_name: destRoom?.name ?? quest.target_ref,
        }).eq("id", user.id);
      }

      await admin.from("world_events").insert({
        kind: "quest_accepted",
        actor_id: user.id,
        actor_name: profile?.username,
        room: profile?.current_room ?? quest.offered_room,
        details: { title: quest.title, objective: quest.objective, giver: quest.giver_npc_name },
      });
      return json({ ok: true, status: "active" });
    }

    if (action === "decline") {
      if (quest.status !== "offered") return json({ error: "this quest is not on offer" }, 400);
      await admin.from("quests").update({ status: "declined" }).eq("id", quest_id);
      return json({ ok: true, status: "declined" });
    }

    if (action === "abandon") {
      if (quest.status !== "active") return json({ error: "this quest is not active" }, 400);
      await admin.from("quests").update({ status: "abandoned" }).eq("id", quest_id);
      // Small amity hit with the giver.
      const { data: amity } = await admin.from("npc_amity").select("score")
        .eq("user_id", user.id).eq("npc_id", quest.giver_npc_id).maybeSingle();
      const next = Math.max(-100, Math.min(100, (amity?.score ?? 0) - 5));
      await admin.from("npc_amity").upsert({
        npc_id: quest.giver_npc_id, user_id: user.id, score: next, updated_at: new Date().toISOString(),
      }, { onConflict: "npc_id,user_id" });

      await admin.from("world_events").insert({
        kind: "quest_abandoned",
        actor_id: user.id,
        actor_name: profile?.username,
        room: profile?.current_room,
        details: { title: quest.title, giver: quest.giver_npc_name },
      });
      return json({ ok: true, status: "abandoned" });
    }
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "error" }, 500);
  }
});
