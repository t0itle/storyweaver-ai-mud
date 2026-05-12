// Bind the player to an Aether of the Speaker. One-time, must be in the Hall of Choice.
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

    const { aether_key } = await req.json();
    if (!aether_key) return json({ error: "Choose an Aether." }, 400);
    if (aether_key === "chaos") return json({ error: "The basin will not accept Chaos. If you would forsake the seven, you must speak the words yourself — out in the world." }, 400);

    const { data: profile } = await admin.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (!profile) return json({ error: "No profile." }, 400);
    const HALL_ROOMS = new Set(["sevenfold-square", "hall-of-the-seven"]);
    if (!HALL_ROOMS.has(profile.current_room))
      return json({ error: "You can only align yourself in the Hall of Choosing, at the heart of the First City." }, 400);
    if (profile.aether || profile.faction)
      return json({ error: `You are already sworn. The Speaker keeps oaths.` }, 400);

    const { data: aether } = await admin.from("aethers").select("*").eq("key", aether_key).maybeSingle();
    if (!aether)  return json({ error: "No such Aether." }, 400);
    const destination = aether.well_room ?? profile.current_room;

    // Apply gift effects.
    const updates: Record<string, unknown> = {
      aether: aether.key,
      faction: "aether",
      aether_chosen_at: new Date().toISOString(),
      current_room: destination,
    };
    if (aether.key === "pyrrhus") {
      updates.max_hp = (profile.max_hp ?? 20) + 2;
      updates.hp = Math.min(profile.hp + 2, (profile.max_hp ?? 20) + 2);
    }
    // Aligning is itself an act of speech — it pushes back the Shadow a touch.
    updates.corruption = Math.max(0, (profile.corruption ?? 0) - 5);

    const { error } = await admin.from("profiles").update(updates).eq("id", user.id);
    if (error) throw error;

    await admin.from("messages").insert({
      room: profile.current_room,
      user_id: null,
      author_name: "—",
      kind: "system",
      content: `${profile.username} kneels at the basin of ${aether.name}. The water trembles. A glyph (${aether.glyph}) burns onto their skin and is gone. The world folds — they are carried to the heart of ${aether.name}'s realm.\nGift: ${aether.gift}\nVow: ${aether.vow}`,
    });
    if (destination !== profile.current_room) {
      await admin.from("messages").insert({
        room: destination,
        user_id: null,
        author_name: "—",
        kind: "ambient",
        content: `*The air parts. ${profile.username} steps from nothing, the glyph of ${aether.name} still smoking on their skin.*`,
      });
      await admin.from("world_events").insert({
        kind: "aether_aligned",
        actor_id: user.id, actor_name: profile.username,
        target_name: aether.key, room: destination,
        details: { aether: aether.key, from: profile.current_room },
      });
    }

    return json({ ok: true, aether, destination });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "error" }, 500);
  }
});
