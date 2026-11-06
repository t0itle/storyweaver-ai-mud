// Logged when a player walks out of the Hall of Seven Ways without choosing.
// Increments hall_refusals + chaos_pressure. Shadow whispers scale with pressure.
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

    const { data: profile } = await admin.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (!profile) return json({ error: "no profile" }, 400);
    if (profile.aether || profile.faction) return json({ ok: true, ignored: true });

    const refusals = (profile.hall_refusals ?? 0) + 1;
    const pressure = Math.min(100, (profile.chaos_pressure ?? 0) + 10);

    await admin.from("profiles").update({
      hall_refusals: refusals,
      chaos_pressure: pressure,
    }).eq("id", user.id);

    // Only log first refusal to journal — avoid spam.
    if (refusals === 1) {
      await admin.from("world_events").insert({
        kind: "aethers_refused",
        actor_id: user.id,
        actor_name: profile.username,
        room: profile.current_room,
        details: { refusals },
      });
    }

    return json({ ok: true, hall_refusals: refusals, chaos_pressure: pressure });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "error" }, 500);
  }
});
