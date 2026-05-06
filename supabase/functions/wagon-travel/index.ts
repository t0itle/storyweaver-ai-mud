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

    // must have visited destination before
    const { data: visited } = await admin.from("world_events")
      .select("id").eq("actor_id", user.id).eq("kind", "discovered_room").eq("target_name", destination).limit(1);
    const { data: alsoVisited } = visited?.length ? { data: visited } : await admin.from("world_events")
      .select("id").eq("actor_id", user.id).eq("room", destination).limit(1);
    if (!alsoVisited?.length) {
      return new Response(JSON.stringify({ error: "You have never set foot there. Walk it first." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if ((profile.gold ?? 0) < route.cost_gold) {
      return new Response(JSON.stringify({ error: `The wagonmaster wants ${route.cost_gold}g; you have ${profile.gold ?? 0}g.` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: destRoom } = await admin.from("rooms").select("name").eq("slug", destination).maybeSingle();
    const destName = destRoom?.name ?? destination;

    await admin.from("profiles").update({
      gold: profile.gold - route.cost_gold,
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
      details: { from: hub, cost: route.cost_gold },
    });

    return new Response(JSON.stringify({ ok: true, destination, cost: route.cost_gold }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
