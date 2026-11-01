import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { abilityScores, check, checkModifier, formatCheck } from "../_shared/dice.ts";

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
    const npcId: string | undefined = body?.npc_id;
    if (!npcId) return new Response(JSON.stringify({ error: "npc_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: profile } = await admin.from("profiles").select("id, username, gold, current_room, level, str, dex, con, int, wis, cha").eq("id", user.id).maybeSingle();
    if (!profile) throw new Error("no profile");

    const { data: npc } = await admin.from("npcs")
      .select("id, name, title, room, purse_gold, is_warden, is_aether, is_merchant, is_guildmaster, is_soul")
      .eq("id", npcId).maybeSingle();
    if (!npc) return new Response(JSON.stringify({ error: "no such soul here" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (npc.room !== profile.current_room) {
      return new Response(JSON.stringify({ error: "they are not in this room" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (npc.is_soul) {
      return new Response(JSON.stringify({ error: "they have nothing to take — they are not of this world." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // d20 + DEX modifier + level bonus vs DC. Higher DC for marks who would notice.
    let dc = 10;
    if (npc.is_merchant) dc += 4;        // sharp eyes for coins
    if (npc.is_warden) dc += 5;          // trained
    if (npc.is_aether) dc += 12;         // forget it
    if (npc.is_guildmaster) dc += 3;
    const chk = check({ dc, modifier: checkModifier(abilityScores(profile as any), "dex", (profile as any).level ?? 1) });
    const { roll, success } = chk;
    const rollText = formatCheck(chk);
    const room = profile.current_room;

    if (!success) {
      // Caught. Big amity hit + town rep ding + everyone in the room sees it.
      const { data: amityRow } = await admin.from("npc_amity").select("score").eq("npc_id", npc.id).eq("user_id", user.id).maybeSingle();
      const newScore = Math.max(-100, (amityRow?.score ?? 0) - 25);
      await admin.from("npc_amity").upsert(
        { npc_id: npc.id, user_id: user.id, score: newScore, updated_at: new Date().toISOString() },
        { onConflict: "npc_id,user_id" },
      );
      await admin.from("messages").insert({
        room, author_name: "—", kind: "ambient",
        content: `*${profile.username} tries to lift a coin from ${npc.name}'s purse — and is caught red-handed (rolled **${rollText}**). ${npc.name} jerks back with a snarl.*`,
        user_id: null,
      });
      await admin.from("world_events").insert({
        kind: "steal_failed",
        actor_name: profile.username, actor_id: user.id,
        target_name: npc.name, target_id: npc.id, room,
        details: { dc, roll, modifier: chk.modifier, total: chk.total },
        decay_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 3).toISOString(),
      });
      return new Response(JSON.stringify({ ok: true, success: false, roll, dc, amity: newScore }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Success — take 5–25% of the purse, capped at 30g per attempt.
    const purse = npc.purse_gold ?? 0;
    if (purse <= 0) {
      await admin.from("messages").insert({
        room, author_name: "—", kind: "ambient",
        content: `*${profile.username} dips into ${npc.name}'s purse unseen (rolled **${rollText}**) — but it is empty. They got nothing for the risk.*`,
        user_id: null,
      });
      return new Response(JSON.stringify({ ok: true, success: true, gold: 0, roll, dc }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const pct = 0.05 + Math.random() * 0.20;
    const taken = Math.max(1, Math.min(30, Math.floor(purse * pct)));
    await admin.from("npcs").update({ purse_gold: purse - taken }).eq("id", npc.id);

    // Roughly 1-in-3 successful pickpockets on a merchant also lift a small item
    // from their stock — flagged STOLEN, sellable only to a fence (or risky to use).
    let stolenItem: { key: string; name: string } | null = null;
    if ((npc as any).is_merchant && Math.random() < 0.34) {
      const cats: string[] = ((npc as any).merchant_categories ?? []) as string[];
      // pick a cheap pocketable item to steal
      let q = admin.from("items").select("key, name, value, slot")
        .lte("value", 40).gte("value", 3)
        .in("slot", ["misc", "consumable", "focus"])
        .limit(40);
      const { data: pool } = await q;
      const filtered = (pool ?? []).filter((it: any) => {
        if (!cats.length) return true;
        return cats.some((c) => it.key.includes(c) || it.name.toLowerCase().includes(c));
      });
      const pick = (filtered.length ? filtered : (pool ?? []))[Math.floor(Math.random() * Math.max(1, (filtered.length ? filtered.length : (pool ?? []).length)))];
      if (pick) {
        await admin.from("player_items").insert({
          user_id: user.id, item_key: pick.key, quantity: 1, stolen: true,
        });
        stolenItem = { key: pick.key, name: pick.name };
      }
    }

    // Every successful theft bumps infamy slightly. Wardens/aethers count for more.
    const infamyDelta = 1 + (npc.is_warden ? 2 : 0) + (npc.is_aether ? 6 : 0) + (stolenItem ? 1 : 0);
    await admin.from("profiles").update({
      gold: (profile.gold ?? 0) + taken,
      infamy: (profile.infamy ?? 0) + infamyDelta,
    }).eq("id", user.id);

    // Quiet success — only the thief sees the result clearly.
    const lifted = stolenItem ? `, plus a *${stolenItem.name}* tucked from their stock` : "";
    await admin.from("messages").insert({
      room, author_name: "—", kind: "ambient",
      content: `*${profile.username} slips a hand past ${npc.name} — unseen (rolled **${rollText}**). +${taken}g${lifted}.*`,
      user_id: null,
    });
    await admin.from("world_events").insert({
      kind: "steal_success",
      actor_name: profile.username, actor_id: user.id,
      target_name: npc.name, target_id: npc.id, room,
      details: { gold: taken, dc, roll, modifier: chk.modifier, total: chk.total, item: stolenItem?.key ?? null },
      decay_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(),
    });

    return new Response(JSON.stringify({ ok: true, success: true, gold: taken, item: stolenItem, roll, dc }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
