// Item and place Wardens: `list` those standing in the player's room, `shatter` a relic (STR) or
// `desecrate` a sacred place (WIS). Dice decide (_shared/dice.ts); the DB trigger on
// wardens.destroyed_at decides whether the Aether falls (last Warden standing).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { abilityScores, check, checkModifier, formatCheck, rollDie, type Ability } from "../_shared/dice.ts";
import { afterBacklash, assaultBlocked, BACKLASH_DIE, type WardenVerb } from "../_shared/wardens.ts";

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

    const { action, warden_id } = await req.json();
    const { data: profile } = await admin.from("profiles")
      .select("id, username, current_room, hp, aether, level, str, dex, con, int, wis, cha, in_combat_id, dead")
      .eq("id", user.id).maybeSingle();
    if (!profile) return json({ error: "no profile" }, 404);

    if (action === "list") {
      const { data } = await admin.from("wardens").select("id, aether_key, kind, name, description")
        .eq("room_slug", profile.current_room).in("kind", ["item", "place"]).is("destroyed_at", null);
      return json({ ok: true, wardens: data ?? [] });
    }

    if (action !== "shatter" && action !== "desecrate") return json({ error: "unknown action" }, 400);
    if (profile.dead || profile.in_combat_id) return json({ error: "Not now." }, 400);
    const verb = action as WardenVerb;

    // Default target: the one item/place Warden of the right kind in this room.
    let q = admin.from("wardens").select("*").eq("room_slug", profile.current_room);
    q = warden_id ? q.eq("id", warden_id) : q.eq("kind", verb === "shatter" ? "item" : "place");
    const { data: warden } = await q.limit(1).maybeSingle();
    if (!warden) return json({ error: verb === "shatter" ? "There is no relic here to shatter." : "There is nothing sacred here to desecrate." }, 404);

    const { data: last } = await admin.from("world_events").select("created_at")
      .eq("kind", "warden_assault").eq("actor_id", user.id).eq("target_id", warden.id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    const now = new Date();
    const blocked = assaultBlocked({ verb, warden, player: profile, lastAttemptAt: last?.created_at ?? null, now });
    if (blocked) return json({ error: blocked }, 400);

    const ability = (warden.check_ability ?? (verb === "shatter" ? "str" : "wis")) as Ability;
    const roll = check({ dc: warden.check_dc ?? 18, modifier: checkModifier(abilityScores(profile as any), ability, profile.level ?? 1) });
    const aetherName = warden.aether_key[0].toUpperCase() + warden.aether_key.slice(1);
    await admin.from("world_events").insert({
      kind: "warden_assault", actor_id: user.id, actor_name: profile.username, room: profile.current_room,
      target_kind: "warden", target_id: warden.id, target_name: warden.name,
      details: { verb, aether: warden.aether_key, roll: roll.roll, total: roll.total, dc: roll.dc, success: roll.success },
      decay_at: new Date(now.getTime() + 7 * 86_400_000).toISOString(),
    });

    if (!roll.success) {
      const damage = rollDie(BACKLASH_DIE);
      const hp = afterBacklash(profile.hp ?? 1, damage);
      await admin.from("profiles").update({ hp }).eq("id", user.id);
      await admin.from("messages").insert({
        room: profile.current_room, user_id: null, author_name: "—", kind: "ambient",
        content: `*${profile.username} tries to ${verb} ${warden.name} — and ${aetherName}'s Warden lashes back (${ability.toUpperCase()} **${formatCheck(roll)}**, −${damage} HP).*`,
      });
      return json({ ok: true, success: false, roll, damage, hp });
    }

    // Success: the DB trigger records the fall of the Aether if this was its last Warden.
    await admin.from("wardens").update({
      destroyed_at: now.toISOString(), destroyed_by: user.id, destroyed_by_name: profile.username,
    }).eq("id", warden.id).is("destroyed_at", null);
    await admin.from("messages").insert({
      room: profile.current_room, user_id: null, author_name: "—", kind: "system",
      content: verb === "shatter"
        ? `✦ ${profile.username} shatters ${warden.name} (${ability.toUpperCase()} **${formatCheck(roll)}**). A Warden of ${aetherName} is no more.`
        : `✦ ${profile.username} desecrates ${warden.name} (${ability.toUpperCase()} **${formatCheck(roll)}**). A Warden of ${aetherName} is no more.`,
    });
    const { count: standing } = await admin.from("wardens").select("id", { count: "exact", head: true })
      .eq("aether_key", warden.aether_key).is("destroyed_at", null);
    return json({ ok: true, success: true, roll, wardens_standing: standing ?? null, aether_fell: (standing ?? 1) === 0 });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "error" }, 500);
  }
});
