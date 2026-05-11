// Pay an NPC for a service (healing, cures, etc).
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

    const { action, npc_id, service_key } = await req.json();
    if (!action || !npc_id) return json({ error: "action and npc_id required" }, 400);

    const { data: npc } = await admin.from("npcs")
      .select("id, name, room, dead_until, hidden, purse_gold").eq("id", npc_id).maybeSingle();
    if (!npc) return json({ error: "no such NPC" }, 404);
    if (npc.hidden || (npc.dead_until && new Date(npc.dead_until) > new Date()))
      return json({ error: `${npc.name} cannot help you right now.` }, 400);

    const { data: profile } = await admin.from("profiles")
      .select("id, username, current_room, gold, hp, max_hp, last_damage_kind, corruption").eq("id", user.id).maybeSingle();
    if (!profile) return json({ error: "no profile" }, 400);
    if (profile.current_room !== npc.room)
      return json({ error: `You are not where ${npc.name} is.` }, 400);

    const { data: services } = await admin.from("npc_services")
      .select("*").eq("npc_id", npc_id).order("price_gold", { ascending: true });

    if (action === "list") {
      return json({ ok: true, npc: { name: npc.name }, services: services ?? [] });
    }

    if (action === "buy") {
      if (!service_key) return json({ error: "service_key required" }, 400);
      const svc = (services ?? []).find(s => s.key === service_key);
      if (!svc) return json({ error: "no such service" }, 404);

      // Honor a personal price-offer if one is currently active and cheaper.
      const { data: offer } = await admin.from("npc_service_offers")
        .select("id, price_gold")
        .eq("npc_id", npc_id).eq("user_id", user.id).eq("service_key", svc.key)
        .is("used_at", null).gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      const finalPrice = offer && offer.price_gold < svc.price_gold ? offer.price_gold : svc.price_gold;

      if ((profile.gold ?? 0) < finalPrice)
        return json({ error: `You lack the silver. ${svc.name} costs ${finalPrice}g.` }, 400);

      let note = "";
      let hpAfter = profile.hp;
      let damageKindAfter = profile.last_damage_kind;
      if (svc.kind === "heal_full") {
        hpAfter = profile.max_hp;
        note = `${npc.name} works in silence. You rise whole — ${profile.max_hp}/${profile.max_hp} hp.`;
      } else if (svc.kind === "heal_amount") {
        hpAfter = Math.min(profile.max_hp, (profile.hp ?? 0) + (svc.amount ?? 0));
        note = `${npc.name} dresses your wounds (+${hpAfter - (profile.hp ?? 0)} hp → ${hpAfter}/${profile.max_hp}).`;
      } else if (svc.kind === "cure_poison") {
        if (profile.last_damage_kind === "poison") damageKindAfter = null;
        note = `${npc.name} brews a bitter cordial. The poison loosens its grip.`;
      } else {
        return json({ error: "unknown service kind" }, 500);
      }

      await admin.from("profiles").update({
        gold: (profile.gold ?? 0) - svc.price_gold,
        hp: hpAfter,
        last_damage_kind: damageKindAfter,
      }).eq("id", user.id);

      await admin.from("npcs").update({
        purse_gold: (npc.purse_gold ?? 0) + svc.price_gold,
      }).eq("id", npc_id);

      await admin.from("world_events").insert({
        kind: "service_paid",
        actor_id: user.id, actor_name: profile.username,
        target_id: npc_id, target_name: npc.name,
        room: npc.room,
        details: { service: svc.key, name: svc.name, gold: svc.price_gold },
      });

      return json({
        ok: true,
        note,
        gold_spent: svc.price_gold,
        hp: hpAfter,
        max_hp: profile.max_hp,
      });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "error" }, 500);
  }
});
