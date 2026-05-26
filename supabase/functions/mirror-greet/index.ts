// When a sworn player enters their Aether's well-room, the Mirror greets them first.
// Rate-limited: at most one greeting per user per room per hour.
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

    const { data: profile } = await admin.from("profiles").select("aether, current_room, username").eq("id", user.id).maybeSingle();
    if (!profile?.aether) return json({ ok: true, skipped: "no_aether" });

    const { data: aether } = await admin.from("aethers").select("name, well_room").eq("key", profile.aether).maybeSingle();
    if (!aether?.well_room || aether.well_room !== profile.current_room) return json({ ok: true, skipped: "not_well" });

    const aetherShort = aether.name.split(",")[0];
    const { data: guide } = await admin.from("npcs")
      .select("id, name, title, greeting")
      .eq("home_room", aether.well_room)
      .ilike("title", `%Mirror of ${aetherShort}%`)
      .maybeSingle();
    if (!guide) return json({ ok: true, skipped: "no_guide" });

    // Throttle: skip if this guide already addressed this user in this room within the last hour.
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: recent } = await admin.from("messages")
      .select("id")
      .eq("room", aether.well_room).eq("npc_id", guide.id).eq("addressed_to", user.id)
      .gte("created_at", since).limit(1);
    if (recent && recent.length) return json({ ok: true, skipped: "recent" });

    await admin.from("messages").insert([
      {
        room: aether.well_room, user_id: null, author_name: "—", kind: "ambient",
        content: `*${guide.name} catches your eye and steps forward to meet you.*`,
      },
      {
        room: aether.well_room, user_id: null, npc_id: guide.id,
        author_name: guide.name, kind: "say", addressed_to: user.id,
        content: guide.greeting ?? `Welcome back, sworn. I am ${guide.name}, your Mirror. Ask me anything.`,
      },
    ]);
    return json({ ok: true, greeted: guide.name });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "error" }, 500);
  }
});
