import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = await req.json();
    const destination = String(body?.destination ?? "").trim();
    if (!destination) return new Response(JSON.stringify({ error: "destination required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: profile } = await admin.from("profiles").select("id, username, gold, current_room").eq("id", user.id).maybeSingle();
    if (!profile) return new Response(JSON.stringify({ error: "no profile" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Wagonmaster operates from the player's current room (must be a hub)
    const hub = profile.current_room;
    const { data: route } = await admin.from("wagon_routes")
      .select("cost_gold, flavor").eq("hub", hub).eq("destination", destination).maybeSingle();
    if (!route) return new Response(JSON.stringify({ error: "No wagon runs that route from here." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Wagonmasters know the road to every capital — even ones the traveler has never seen.


    // Skill: Map-Sense — 20% wagon discount.
    const { data: mapSense } = await admin.from("player_skills")
      .select("node_key").eq("user_id", user.id).eq("node_key", "map_sense").maybeSingle();
    const cost = mapSense ? Math.max(1, Math.ceil(route.cost_gold * 0.8)) : route.cost_gold;

    if ((profile.gold ?? 0) < cost) {
      return new Response(JSON.stringify({ error: `The wagonmaster wants ${cost}g; you have ${profile.gold ?? 0}g.` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: destRoom } = await admin.from("rooms").select("name").eq("slug", destination).maybeSingle();
    const destName = destRoom?.name ?? destination;

    await admin.from("profiles").update({
      gold: profile.gold - cost,
      current_room: destination,
    }).eq("id", user.id);

    // depart message in old room
    await admin.from("messages").insert({
      room: hub, author_name: "—", kind: "ambient",
      content: `*${profile.username} climbs aboard the wagon. It rolls out toward ${destName}.*`,
      user_id: null,
    });
    // arrival message in new room
    await admin.from("messages").insert({
      room: destination, author_name: "—", kind: "ambient",
      content: `*${route.flavor} ${profile.username} steps down.*`,
      user_id: null,
    });
    await admin.from("world_events").insert({
      kind: "wagon_travel",
      actor_name: profile.username, actor_id: user.id,
      target_name: destination, room: destination,
      details: { from: hub, cost },
    });

    return new Response(JSON.stringify({ ok: true, destination, cost }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
