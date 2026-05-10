// Fence stolen goods to a fence NPC standing in the player's current room.
// Action "list" → returns the stolen items in inventory + price the fence will pay.
// Action "sell" → sells one player_item to the fence at fence_rate × item.value.
//                 Reduces player infamy decay slightly, advances thieves' guild quest count.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = await req.json().catch(() => ({}));
    const action: "list" | "sell" = body?.action ?? "list";
    const fenceId: string | undefined = body?.fence_id;
    if (!fenceId) return new Response(JSON.stringify({ error: "fence_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: profile } = await admin.from("profiles").select("id, username, gold, infamy, current_room").eq("id", user.id).maybeSingle();
    if (!profile) throw new Error("no profile");
    const { data: fence } = await admin.from("npcs").select("id, name, room, is_fence, fence_rate, guild_town").eq("id", fenceId).maybeSingle();
    if (!fence || !fence.is_fence) return new Response(JSON.stringify({ error: "no fence here" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (fence.room !== profile.current_room) return new Response(JSON.stringify({ error: "they are not in this room" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const rate = Number(fence.fence_rate ?? 0.55);

    // Stolen items the player is carrying.
    const { data: items } = await admin.from("player_items")
      .select("id, item_key, quantity, equipped_slot, items(key, name, value, slot)")
      .eq("user_id", user.id).eq("stolen", true);

    const list = (items ?? []).map((pi: any) => {
      const v = pi.items?.value ?? 0;
      const each = Math.max(1, Math.floor(v * rate));
      return {
        player_item_id: pi.id,
        item_key: pi.item_key,
        name: pi.items?.name ?? pi.item_key,
        slot: pi.items?.slot ?? "misc",
        quantity: pi.quantity ?? 1,
        equipped: !!pi.equipped_slot,
        full_value: v,
        fence_each: each,
        fence_total: each * (pi.quantity ?? 1),
      };
    });

    if (action === "list") {
      return new Response(JSON.stringify({
        ok: true, fence: { id: fence.id, name: fence.name, rate, town: fence.guild_town },
        gold: profile.gold ?? 0, infamy: profile.infamy ?? 0, items: list,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // sell
    const playerItemId: string | undefined = body?.player_item_id;
    if (!playerItemId) return new Response(JSON.stringify({ error: "player_item_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const target = list.find((x: any) => x.player_item_id === playerItemId);
    if (!target) return new Response(JSON.stringify({ error: "you aren't carrying that, or it isn't stolen" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (target.equipped) return new Response(JSON.stringify({ error: "remove it first — they won't take it off your back" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Take the whole stack at once for now.
    const payout = target.fence_total;
    await admin.from("player_items").delete().eq("id", playerItemId).eq("user_id", user.id);
    await admin.from("profiles").update({
      gold: (profile.gold ?? 0) + payout,
      // a fenced item slowly cools off the player's reputation
      infamy: Math.max(0, (profile.infamy ?? 0) - 1),
    }).eq("id", user.id);

    // Track guild progress: increment quests_completed (used by guild rank thresholds).
    const { data: existingMem } = await admin.from("player_guild_membership")
      .select("quests_completed, rank, status")
      .eq("user_id", user.id).eq("guild_key", "thieves").maybeSingle();
    if (existingMem) {
      await admin.from("player_guild_membership").update({
        quests_completed: (existingMem.quests_completed ?? 0) + 1,
        updated_at: new Date().toISOString(),
      }).eq("user_id", user.id).eq("guild_key", "thieves");
    } else {
      await admin.from("player_guild_membership").insert({
        user_id: user.id, guild_key: "thieves",
        quests_completed: 1, status: "prospect", rank: 0,
      });
    }

    await admin.from("messages").insert({
      room: profile.current_room, author_name: "—", kind: "ambient",
      content: `*${profile.username} slides ${target.name}${(target.quantity ?? 1) > 1 ? ` ×${target.quantity}` : ""} across the table. ${fence.name} weighs it, nods, and counts out **${payout}g**.*`,
      user_id: null,
    });

    await admin.from("world_events").insert({
      kind: "goods_fenced",
      actor_name: profile.username, actor_id: user.id,
      target_name: fence.name, target_id: fence.id, room: profile.current_room,
      details: { item: target.item_key, qty: target.quantity, gold: payout },
      decay_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(),
    });

    return new Response(JSON.stringify({ ok: true, gold: payout }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
