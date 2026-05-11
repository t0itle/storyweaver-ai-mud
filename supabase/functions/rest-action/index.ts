// Rest & Camp.
//   action: "inn"  — in any *-inn room: pay gold, full heal, clear light wounds.
//   action: "camp" — in road / wilds / desert / grove / hollow / shore / bridge:
//                    free, partial heal, ~35% chance of an ambush mid-rest.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const CAMP_KINDS = new Set(["road", "desert", "wilds", "hollow", "grove", "shore", "bridge", "cave"]);
const INN_PRICE = 10;
const CAMP_AMBUSH_CHANCE = 0.35;

const AMBUSH_NPCS = [
  { name: "Greel of the Cinders", title: "deserter", greeting: "Quiet camp. Easy pickings." },
  { name: "Crook-Nose Vell", title: "road bandit", greeting: "Don't reach for the blade — just the purse." },
  { name: "The Burnt Wolf", title: "feral hound", greeting: "*A low growl from the dark.*" },
  { name: "Ash-Mouth Korin", title: "highwayman", greeting: "Should've slept indoors, friend." },
];

function pick<T>(a: T[]): T { return a[Math.floor(Math.random() * a.length)]; }
function SR(n: number) { return Math.floor(Math.random() * n) + 1; }

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

    const { action } = await req.json();
    if (action !== "inn" && action !== "camp") return json({ error: "action must be 'inn' or 'camp'" }, 400);

    const { data: profile } = await admin.from("profiles")
      .select("username, current_room, hp, max_hp, gold, in_combat_id, downed, dead")
      .eq("id", user.id).maybeSingle();
    if (!profile) return json({ error: "no profile" }, 404);
    if (profile.in_combat_id) return json({ error: "You can't rest mid-fight." }, 400);
    if (profile.downed || profile.dead) return json({ error: "You're in no shape to rest." }, 400);
    if ((profile.hp ?? 0) >= (profile.max_hp ?? 20)) return json({ error: "You're already at full health." }, 400);

    const room = profile.current_room as string;
    const { data: roomRow } = await admin.from("rooms").select("slug, kind, name").eq("slug", room).maybeSingle();
    if (!roomRow) return json({ error: "Where are you?" }, 400);

    if (action === "inn") {
      const isInn = room.endsWith("-inn") || roomRow.kind === "inn" || roomRow.kind === "tavern";
      if (!isInn) return json({ error: "There's no innkeeper to take your coin here." }, 400);
      if ((profile.gold ?? 0) < INN_PRICE) return json({ error: `A bed costs ${INN_PRICE}g — you can't afford it.` }, 400);
      await admin.from("profiles").update({
        gold: profile.gold - INN_PRICE,
        hp: profile.max_hp,
      }).eq("id", user.id);
      await admin.from("messages").insert({
        room, author_name: "—", kind: "ambient", user_id: null,
        content: `*${profile.username} pays ${INN_PRICE}g for a bed at ${roomRow.name}. Hours pass; the wounds close.*`,
      });
      return json({ ok: true, mode: "inn", healed: profile.max_hp - profile.hp, cost: INN_PRICE });
    }

    // camp
    if (!CAMP_KINDS.has(roomRow.kind)) {
      return json({ error: "You can't make camp here. Find an inn, the road, or the wilds." }, 400);
    }

    const healed = Math.min(profile.max_hp - profile.hp, Math.ceil(profile.max_hp * 0.5));
    const ambushed = Math.random() < CAMP_AMBUSH_CHANCE;

    if (!ambushed) {
      await admin.from("profiles").update({
        hp: profile.hp + healed,
        last_encounter_at: new Date().toISOString(),
      }).eq("id", user.id);
      await admin.from("messages").insert({
        room, author_name: "—", kind: "ambient", user_id: null,
        content: `*${profile.username} makes camp. The fire crackles low; sleep comes uneventful.* (+${healed} HP)`,
      });
      return json({ ok: true, mode: "camp", healed, ambushed: false });
    }

    // Heal a little, then jump them.
    const partial = Math.floor(healed / 3);
    const t = pick(AMBUSH_NPCS);
    const { data: npc } = await admin.from("npcs").insert({
      name: t.name, title: t.title, persona: "ambusher",
      greeting: t.greeting, room, home_room: room,
    }).select("id, name").single();

    const playerHp = profile.hp + partial;
    const npcMax = 12 + SR(8);
    const playerInit = 8 + SR(8);   // groggy
    const npcInit = 14 + SR(10);    // they get the jump
    const npcFirst = npcInit >= playerInit;

    const { data: combat } = await admin.from("combats").insert({
      room, status: "active", turn_number: 1,
    }).select("id").single();

    const { data: combatants } = await admin.from("combatants").insert([
      { combat_id: combat!.id, side: "a", kind: "player", user_id: user.id,
        name: profile.username, hp: playerHp, max_hp: profile.max_hp,
        initiative: playerInit, turn_order: npcFirst ? 1 : 0 },
      { combat_id: combat!.id, side: "b", kind: "npc", npc_id: npc!.id,
        name: npc!.name, hp: npcMax, max_hp: npcMax,
        initiative: npcInit, turn_order: npcFirst ? 0 : 1 },
    ]).select("id, turn_order");

    const first = (combatants ?? []).sort((a: any, b: any) => a.turn_order - b.turn_order)[0];
    await admin.from("combats").update({ current_combatant_id: first.id }).eq("id", combat!.id);
    await admin.from("profiles").update({
      hp: playerHp,
      in_combat_id: combat!.id,
      last_encounter_at: new Date().toISOString(),
    }).eq("id", user.id);

    await admin.from("messages").insert({
      room, author_name: "—", kind: "ambient", user_id: null,
      content: `*${profile.username} settles by the fire — and wakes to ${t.name}, ${t.title}, looming over the embers.* "${t.greeting}"`,
    });
    await admin.from("combat_actions").insert({
      combat_id: combat!.id, turn_number: 1, actor_id: null,
      actor_name: t.name, action: "system", target_name: profile.username,
      text: `${t.name} springs from the dark!`, damage: 0,
    });

    return json({ ok: true, mode: "camp", healed: partial, ambushed: true, combat_id: combat!.id, npc_name: t.name });
  } catch (e) {
    console.error("rest-action", e);
    return json({ error: e instanceof Error ? e.message : "error" }, 500);
  }
});
