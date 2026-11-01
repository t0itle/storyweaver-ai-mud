import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { abilityScores, check, checkModifier, formatCheck } from "../_shared/dice.ts";

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

    const { data: profile } = await admin.from("profiles").select("id, username, gold, current_room, level, str, dex, con, int, wis, cha").eq("id", user.id).maybeSingle();
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
      await admin.from("messages").insert({
        room, author_name: "—", kind: "ambient",
        content: `*${profile.username} searches, but finds only dust and disappointment.*`,
        user_id: null,
      });
      return new Response(JSON.stringify({ ok: true, found: false }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Has THIS player already claimed it personally?
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

    // Roll a 12-sided die + WIS modifier + level bonus; must meet or beat the cache's find_dc.
    // Stays a d12 so the stored find_dc values keep their meaning.
    const dc = cache.find_dc ?? 7;
    const chk = check({ die: 12, dc, modifier: checkModifier(abilityScores(profile as any), "wis", (profile as any).level ?? 1) });
    const { roll, success } = chk;
    const rollText = formatCheck(chk);

    // Cache already uncovered by someone before this player?
    if (cache.revealed_at) {
      if (!success) {
        await admin.from("messages").insert({
          room, author_name: "—", kind: "ambient",
          content: `*${profile.username} searches around (rolled **${rollText}**) — they sense something was here, but the moment slips past them.*`,
          user_id: null,
        });
        return new Response(JSON.stringify({ ok: true, found: false, roll, dc }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      // Success but the cache is already empty — record the claim so they don't keep finding nothing.
      await admin.from("player_room_cache_claims").insert({ user_id: user.id, room });
      const finder = cache.revealed_by_name ?? "someone";
      await admin.from("messages").insert({
        room, author_name: "—", kind: "ambient",
        content: `*${profile.username} uncovers the hiding place (rolled **${rollText}**) — but the chest lies open and looted clean. ${finder} got here first.*`,
        user_id: null,
      });
      return new Response(JSON.stringify({ ok: true, found: true, empty: true, roll, dc }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Cache is still hidden — must succeed on the roll to find it.
    if (!success) {
      await admin.from("messages").insert({
        room, author_name: "—", kind: "ambient",
        content: `*${profile.username} searches the area (rolled **${rollText}**) but turns up nothing.*`,
        user_id: null,
      });
      return new Response(JSON.stringify({ ok: true, found: false, roll, dc }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // First successful find — claim, award, and reveal the cache to the room forever.
    await admin.from("player_room_cache_claims").insert({ user_id: user.id, room });
    await admin.from("room_caches").update({
      revealed_at: new Date().toISOString(),
      revealed_by_name: profile.username,
    }).eq("room", room);

    // Special: some caches also unlock a hidden passage for the finder.
    const HIDDEN_EXITS: Record<string, { dir: string; to_room: string; label: string }> = {
      "ruin-sun-orphanage": { dir: "down", to_room: "well-mouth", label: "down the well-shaft" },
    };
    const unlock = HIDDEN_EXITS[room];
    if (unlock) {
      await admin.from("player_room_extra_exits").upsert({
        user_id: user.id, room, dir: unlock.dir, to_room: unlock.to_room, label: unlock.label,
      }, { onConflict: "user_id,room,dir" });
    }

    // Drop the contents on the floor as a loot pile — anyone in the room can `take` it now.
    if (cache.gold) {
      await admin.from("room_loot").insert({
        room, gold: cache.gold, source: `cache:${room}`, placed_by_name: profile.username,
      });
    }
    if (cache.item_key) {
      await admin.from("room_loot").insert({
        room, gold: 0, item_key: cache.item_key, quantity: 1,
        source: `cache:${room}`, placed_by_name: profile.username,
      });
    }

    await admin.from("messages").insert({
      room, author_name: "—", kind: "ambient",
      content: `*${profile.username} rolled **${rollText}** — ${cache.reveal_text}* The treasure lies revealed: **${cache.gold}g**${cache.item_key ? ` and **${cache.item_key}**` : ""}. Use **take** to claim it.`,
      user_id: null,
    });
    await admin.from("world_events").insert({
      kind: "cache_found",
      actor_name: profile.username, actor_id: user.id,
      target_name: room, room,
      details: { gold: cache.gold, item: cache.item_key, roll, dc },
    });

    return new Response(JSON.stringify({ ok: true, found: true, dropped: true, gold: cache.gold, item: cache.item_key, roll, dc }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
