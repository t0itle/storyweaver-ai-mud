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

    const { data: profile } = await admin.from("profiles").select("id, username, gold, current_room").eq("id", user.id).maybeSingle();
    if (!profile) return new Response(JSON.stringify({ error: "no profile" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const room = profile.current_room;
    const { data: cache } = await admin.from("room_caches").select("*").eq("room", room).maybeSingle();
    if (!cache) {
      // Soft fail: still post a message so the player knows nothing is here
      await admin.from("messages").insert({
        room, author_name: "—", kind: "ambient",
        content: `*${profile.username} searches, but finds only dust and disappointment.*`,
        user_id: null,
      });
      return new Response(JSON.stringify({ ok: true, found: false }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: existing } = await admin.from("player_room_cache_claims")
      .select("room").eq("user_id", user.id).eq("room", room).maybeSingle();
    if (existing) {
      await admin.from("messages").insert({
        room, author_name: "—", kind: "ambient",
        content: `*${profile.username} sifts the same hiding place again. There is nothing more to find here.*`,
        user_id: null,
      });
      return new Response(JSON.stringify({ ok: true, found: false, already: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    await admin.from("player_room_cache_claims").insert({ user_id: user.id, room });
    if (cache.gold) {
      await admin.from("profiles").update({ gold: (profile.gold ?? 0) + cache.gold }).eq("id", user.id);
    }
    if (cache.item_key) {
      await admin.from("player_items").insert({ user_id: user.id, item_key: cache.item_key, quantity: 1 });
    }

    await admin.from("messages").insert({
      room, author_name: "—", kind: "ambient",
      content: `*${cache.reveal_text}* (+${cache.gold}g${cache.item_key ? `, ${cache.item_key}` : ""})`,
      user_id: null,
    });
    await admin.from("world_events").insert({
      kind: "cache_found",
      actor_name: profile.username, actor_id: user.id,
      target_name: room, room,
      details: { gold: cache.gold, item: cache.item_key },
    });

    return new Response(JSON.stringify({ ok: true, found: true, gold: cache.gold, item: cache.item_key }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
