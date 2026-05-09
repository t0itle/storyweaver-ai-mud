// Mercantile market — list a merchant's goods (with live prices), buy, sell.
//
// Pricing model:
//   final = base_price * locality * tidal * events * tariff * spread
//
//   locality:   0.55 if you're in the good's origin town (oversupply); 1.45 elsewhere (rare).
//   tidal:      1 + 0.25 * sin(hours_since_epoch * π/12 + good.demand_phase + town_seed)
//   events:     product of all active market_events whose town/category/item match.
//   tariff:     based on player's town_rep — friendlier towns give better margins.
//   spread:     buy = 1.00, sell-to-merchant = 0.55  (enforces the buy-low/sell-high loop).
//
// Weight: enforced via profile.max_weight vs. sum(player_items.quantity * items.weight).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

type Action =
  | { action: "list"; merchant_id: string }
  | { action: "buy"; merchant_id: string; item_key: string; quantity: number }
  | { action: "sell"; merchant_id: string; item_key: string; quantity: number };

const SELL_SPREAD = 0.55;

function townSeed(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return (h % 1000) / 159.155; // ~0..2π
}

function localityMult(origin: string, here: string): number {
  return origin === here ? 0.55 : 1.45;
}

function tidalMult(phase: number, town: string): number {
  const hours = Date.now() / 3_600_000;
  return 1 + 0.25 * Math.sin(hours * Math.PI / 12 + phase + townSeed(town));
}

function eventsMult(events: { town_key: string | null; category: string | null; item_key: string | null; multiplier: number }[],
                    town: string, category: string, itemKey: string): number {
  let m = 1;
  for (const e of events) {
    if (e.town_key && e.town_key !== town) continue;
    if (e.category && e.category !== category) continue;
    if (e.item_key && e.item_key !== itemKey) continue;
    m *= Number(e.multiplier);
  }
  return m;
}

function tariffMult(rep: number, side: "buy" | "sell"): number {
  // rep < -25 = enemy; > 25 = friend
  if (rep <= -25) return side === "buy" ? 2.0 : 0.5;
  if (rep >= 25)  return side === "buy" ? 0.9 : 1.1;
  return 1.0;
}

function priceFor(good: { base_price: number; demand_phase: number; origin_town_key: string; category: string; item_key: string },
                  town: string, rep: number, events: any[], side: "buy" | "sell"): number {
  const base = good.base_price;
  const loc = localityMult(good.origin_town_key, town);
  const tid = tidalMult(Number(good.demand_phase), town);
  const ev  = eventsMult(events, town, good.category, good.item_key);
  const tar = tariffMult(rep, side);
  const spread = side === "buy" ? 1.0 : SELL_SPREAD;
  const px = base * loc * tid * ev * tar * spread;
  return Math.max(1, Math.round(px));
}

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

    const body = await req.json() as Action;

    const { data: profile } = await admin.from("profiles")
      .select("id, username, current_room, gold, max_weight, dead, downed").eq("id", user.id).maybeSingle();
    if (!profile) return json({ error: "no profile" }, 404);
    if (profile.dead || profile.downed) return json({ error: "you cannot trade in this state" }, 400);

    const { data: merchant } = await admin.from("npcs")
      .select("id, name, room, merchant_town, merchant_categories, is_merchant")
      .eq("id", body.merchant_id).maybeSingle();
    if (!merchant?.is_merchant) return json({ error: "no such merchant" }, 404);
    if (merchant.room !== profile.current_room) return json({ error: "You are not standing with this trader." }, 400);
    const town = merchant.merchant_town!;

    // Town rep + active market events
    const [{ data: rep }, { data: events }] = await Promise.all([
      admin.from("player_town_rep").select("score").eq("user_id", user.id).eq("town_key", town).maybeSingle(),
      admin.from("market_events").select("town_key, category, item_key, multiplier, reason").gte("expires_at", new Date().toISOString()),
    ]);
    const town_rep = rep?.score ?? 0;
    const evs = (events ?? []) as any[];

    // ─── list ───
    if (body.action === "list") {
      const cats = (merchant.merchant_categories ?? []) as string[];
      // Stock = goods of merchant's categories, prefer in-town origins for variety; we cap at 60.
      const { data: goods } = await admin.from("trade_goods")
        .select("item_key, category, origin_town_key, base_price, demand_phase, blurb, items!inner(name, weight)")
        .in("category", cats)
        .limit(800);

      // Score: prefer origin == this town (3x), else random sample within the rest.
      const scored = (goods ?? []).map((g: any) => ({
        ...g, _score: (g.origin_town_key === town ? 3 : 1) * Math.random(),
      })).sort((a: any, b: any) => b._score - a._score).slice(0, 60);

      const stock = scored.map((g: any) => ({
        item_key: g.item_key,
        name: g.items.name,
        weight: Number(g.items.weight),
        category: g.category,
        origin_town_key: g.origin_town_key,
        local: g.origin_town_key === town,
        buy_price: priceFor(g, town, town_rep, evs, "buy"),
        sell_price: priceFor(g, town, town_rep, evs, "sell"),
      }));

      // Player inventory the merchant might buy: any items in player_items the merchant deals in
      const { data: inv } = await admin.from("player_items")
        .select("id, item_key, quantity, equipped_slot, items!inner(name, weight), trade_goods(category, base_price, demand_phase, origin_town_key)")
        .eq("user_id", user.id);
      const offers = (inv ?? [])
        .filter((p: any) => p.trade_goods && cats.includes(p.trade_goods.category) && !p.equipped_slot)
        .map((p: any) => ({
          item_key: p.item_key,
          name: p.items.name,
          quantity: p.quantity,
          weight: Number(p.items.weight),
          category: p.trade_goods.category,
          sell_price: priceFor({ ...p.trade_goods, item_key: p.item_key } as any, town, town_rep, evs, "sell"),
        }));

      // Active market notices for this town (or global)
      const notices = evs.filter(e => !e.town_key || e.town_key === town).map(e => e.reason).filter(Boolean).slice(0, 6);

      return json({
        ok: true,
        merchant: { id: merchant.id, name: merchant.name, town },
        gold: profile.gold,
        max_weight: Number(profile.max_weight),
        town_rep,
        notices,
        stock, offers,
      });
    }

    // ─── buy / sell ───
    const qty = Math.max(1, Math.floor((body as any).quantity ?? 1));
    const itemKey = String((body as any).item_key);

    const { data: good } = await admin.from("trade_goods")
      .select("item_key, category, origin_town_key, base_price, demand_phase, items!inner(name, weight, max_stack)")
      .eq("item_key", itemKey).maybeSingle();
    if (!good) return json({ error: "Not in this trader's stock" }, 400);
    const cats = (merchant.merchant_categories ?? []) as string[];
    if (!cats.includes((good as any).category)) return json({ error: "This trader doesn't deal in that." }, 400);

    if (body.action === "buy") {
      const unit = priceFor(good as any, town, town_rep, evs, "buy");
      const cost = unit * qty;
      if ((profile.gold ?? 0) < cost) return json({ error: `You need ${cost}g (you have ${profile.gold}).` }, 400);

      // Weight check
      const { data: inv } = await admin.from("player_items").select("quantity, items!inner(weight)").eq("user_id", user.id);
      const carried = (inv ?? []).reduce((s, r: any) => s + r.quantity * Number(r.items.weight), 0);
      const addWeight = qty * Number((good as any).items.weight);
      if (carried + addWeight > Number(profile.max_weight)) {
        return json({ error: `Too heavy. You can carry ${(Number(profile.max_weight) - carried).toFixed(1)} more.` }, 400);
      }

      // Add to inventory (stack)
      const { data: existing } = await admin.from("player_items")
        .select("id, quantity").eq("user_id", user.id).eq("item_key", itemKey).is("equipped_slot", null).is("container_id", null).maybeSingle();
      if (existing) {
        await admin.from("player_items").update({ quantity: existing.quantity + qty }).eq("id", existing.id);
      } else {
        await admin.from("player_items").insert({ user_id: user.id, item_key: itemKey, quantity: qty });
      }
      await admin.from("profiles").update({ gold: (profile.gold ?? 0) - cost }).eq("id", user.id);

      // Small town rep bump for trading
      await admin.from("player_town_rep").upsert(
        { user_id: user.id, town_key: town, score: town_rep + 1, updated_at: new Date().toISOString() },
        { onConflict: "user_id,town_key" }
      );

      return json({ ok: true, kind: "buy", unit_price: unit, total: cost, gold: (profile.gold ?? 0) - cost });
    }

    if (body.action === "sell") {
      const unit = priceFor(good as any, town, town_rep, evs, "sell");
      const { data: existing } = await admin.from("player_items")
        .select("id, quantity").eq("user_id", user.id).eq("item_key", itemKey).is("equipped_slot", null).maybeSingle();
      if (!existing || existing.quantity < qty) return json({ error: "You do not have that many." }, 400);
      const payout = unit * qty;
      if (existing.quantity === qty) {
        await admin.from("player_items").delete().eq("id", existing.id);
      } else {
        await admin.from("player_items").update({ quantity: existing.quantity - qty }).eq("id", existing.id);
      }
      await admin.from("profiles").update({ gold: (profile.gold ?? 0) + payout }).eq("id", user.id);
      await admin.from("player_town_rep").upsert(
        { user_id: user.id, town_key: town, score: town_rep + 1, updated_at: new Date().toISOString() },
        { onConflict: "user_id,town_key" }
      );
      return json({ ok: true, kind: "sell", unit_price: unit, total: payout, gold: (profile.gold ?? 0) + payout });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    console.error("market-action error", e);
    return json({ error: e instanceof Error ? e.message : "error" }, 500);
  }
});
