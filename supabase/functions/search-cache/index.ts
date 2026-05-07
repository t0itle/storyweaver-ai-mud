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

    // Check if this is a crypt — if so, "search" reveals lingering souls to this player.
    const { data: roomRow } = await admin.from("rooms").select("kind, name").eq("slug", room).maybeSingle();
    if (roomRow?.kind === "crypt") {
      const { data: hiddenSouls } = await admin.from("npcs")
        .select("id, name, title").eq("room", room).eq("is_soul", true).eq("hidden", true);
      const { data: alreadyFound } = await admin.from("player_npc_discoveries")
        .select("npc_id").eq("user_id", user.id).in("npc_id", (hiddenSouls ?? []).map(s => s.id));
      const foundIds = new Set((alreadyFound ?? []).map((r: any) => r.npc_id));
      const newOnes = (hiddenSouls ?? []).filter(s => !foundIds.has(s.id));
      if (newOnes.length) {
        await admin.from("player_npc_discoveries").insert(
          newOnes.map(s => ({ user_id: user.id, npc_id: s.id })),
        );
        const names = newOnes.map(s => `**${s.name}**${s.title ? ` (${s.title})` : ""}`).join(", ");
        await admin.from("messages").insert({
          room, author_name: "—", kind: "ambient",
          content: `*${profile.username} parts the dust and listens. Lingering shapes resolve in the gloom: ${names}. They cannot be heard without the Blessing of Necros.*`,
          user_id: null,
        });
        return new Response(JSON.stringify({ ok: true, found: true, souls: newOnes.length }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      // No new souls — fall through to cache check below if any, else dust.
    }

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
