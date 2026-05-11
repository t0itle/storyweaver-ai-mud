// Random travel encounters. Called by the client after a player moves into a
// road / desert / wild room. Server-authoritative: enforces a per-player
// cooldown and a base trigger chance, then weighted-picks an encounter type.
//
// Encounter types:
//   ambush      - spawns a hostile NPC; player must `attack` to fight back.
//   traveler    - spawns a friendly NPC and creates an OFFERED escort quest.
//   discovery   - flavor beat + small reward (gold or xp). No spawn.
//   patrol      - spawns a faction patrol NPC; greeting depends on alignment.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const COOLDOWN_SECONDS = 30;
const TRIGGER_CHANCE = 0.45;

const ELIGIBLE_KINDS = new Set([
  "road", "desert", "wilds", "hollow", "grove",
  "ruin", "cave", "lair", "shore", "bridge", "dock", "crypt",
]);

const CAPITAL_DESTINATIONS = [
  { slug: "high-sanctum", name: "The High Sanctum" },
  { slug: "iron-bastion", name: "The Iron Bastion" },
  { slug: "mirrorlands-court", name: "The Mirrorlands Court" },
  { slug: "gilded-bazaar", name: "The Gilded Bazaar" },
  { slug: "silent-horizon", name: "The Silent Horizon" },
  { slug: "evershade-court", name: "The Evershade Court" },
  { slug: "feastlands-keep", name: "The Feastlands Keep" },
  { slug: "first-city", name: "The First City" },
];

const AMBUSH_NPCS = [
  { name: "Crook-Nose Vell", title: "road bandit", greeting: "Coin or blood, traveler. I'll take either." },
  { name: "Ash-Mouth Korin", title: "highwayman", greeting: "Wrong road, friend. Wrong day." },
  { name: "Sister Veiled-Iron", title: "Speaker zealot", greeting: "*She lifts a strip of cloth from her mouth — only to draw a blade.*" },
  { name: "The Burnt Wolf", title: "feral hound", greeting: "*A low, wet growl. The thing was once a wolf.*" },
  { name: "Greel of the Cinders", title: "deserter", greeting: "I'm done running. Hand it over." },
];

const TRAVELERS = [
  { name: "Mira Lensbinder", title: "wandering scribe", plea: "Please — my satchel is full of letters that must reach %DEST%. The road is not safe alone." },
  { name: "Old Bavren", title: "limping pilgrim", plea: "These bones won't carry me much further. Take me to %DEST% and I'll see you fed." },
  { name: "Liss the Sparrow", title: "courier child", plea: "My master is at %DEST%. If I don't get there by dusk he'll lose his contract — and me." },
  { name: "Goodman Tarn", title: "wagonless trader", plea: "Bandits took my mule outside %DEST%. I just need to make the gate — please." },
  { name: "Wren Hollowstep", title: "novice diviner", plea: "The road bends wrong here. Walk with me to %DEST% and I'll teach you a sign." },
];

const PATROLS = [
  { name: "Captain Ortha", title: "kingdom marshal", greeting: "State your business on this road, walker." },
  { name: "Lay-Brother Finn", title: "Veiled outrider", greeting: "*He nods through his linen mask. The Speaker's silence rides with him.*" },
  { name: "Sergeant Wek", title: "border watch", greeting: "Keep moving. The dunes ate three travelers this week." },
];

const DISCOVERIES = [
  { line: "*A flock of bone-ash starlings burst from a thornbush, wheeling once before vanishing west.*", reward: { kind: "xp", amount: 4 } },
  { line: "*Half-buried in the dust: a copper coin with a face worn smooth.*", reward: { kind: "gold", amount: 8 } },
  { line: "*A weathered shrine-stone leans by the path. Someone has left a fresh sprig of thyme on it.*", reward: { kind: "xp", amount: 6 } },
  { line: "*The wind shifts and for a heartbeat you swear you hear a bell, very far off.*", reward: { kind: "xp", amount: 3 } },
  { line: "*A merchant's dropped purse-string lies coiled like a snake. A few coins still cling to it.*", reward: { kind: "gold", amount: 12 } },
  { line: "*The sky goes briefly bronze. A storm is walking somewhere over the Crescent.*", reward: { kind: "xp", amount: 4 } },
  { line: "*A lone crow follows you for three steps, drops a scrap of bright cloth, and is gone.*", reward: { kind: "xp", amount: 5 } },
];

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function weightedKind(): "ambush" | "traveler" | "discovery" | "patrol" {
  const r = Math.random();
  if (r < 0.50) return "ambush";
  if (r < 0.70) return "traveler";
  if (r < 0.88) return "discovery";
  return "patrol";
}

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

    const { room } = await req.json();
    if (!room || typeof room !== "string") return json({ error: "room required" }, 400);

    const { data: roomRow } = await admin.from("rooms").select("slug, kind, name, town_key").eq("slug", room).maybeSingle();
    if (!roomRow) return json({ ok: false, reason: "no-room" });
    if (!ELIGIBLE_KINDS.has(roomRow.kind)) return json({ ok: false, reason: "biome" });
    // City walls keep the wilds out — guards and other players can still strike.
    if (roomRow.town_key) return json({ ok: false, reason: "in-city" });

    const { data: profile } = await admin.from("profiles")
      .select("username, last_encounter_at, in_combat_id, downed, dead, gold, xp")
      .eq("id", user.id).maybeSingle();
    if (!profile) return json({ ok: false, reason: "no-profile" });
    if (profile.in_combat_id || profile.downed || profile.dead) return json({ ok: false, reason: "busy" });

    if (profile.last_encounter_at) {
      const since = (Date.now() - new Date(profile.last_encounter_at).getTime()) / 1000;
      if (since < COOLDOWN_SECONDS) return json({ ok: false, reason: "cooldown" });
    }

    // Cargo-aware risk: heavy / valuable trade cargo attracts bandits.
    const { data: cargo } = await admin
      .from("player_items")
      .select("quantity, trade_goods!inner(base_price)")
      .eq("user_id", user.id);
    const cargoValue = (cargo ?? []).reduce(
      (s, r: any) => s + r.quantity * Number(r.trade_goods?.base_price ?? 0), 0);
    // Up to +0.30 above 1000g of cargo.
    const cargoBoost = Math.min(0.30, cargoValue / 3500);
    const triggerChance = TRIGGER_CHANCE + cargoBoost;

    if (Math.random() > triggerChance) {
      const half = new Date(Date.now() - (COOLDOWN_SECONDS * 500)).toISOString();
      await admin.from("profiles").update({ last_encounter_at: half }).eq("id", user.id);
      return json({ ok: false, reason: "no-roll" });
    }

    // If you carry serious cargo, ambushes become much more likely.
    function pickKind(): "ambush" | "traveler" | "discovery" | "patrol" {
      if (cargoValue > 200) {
        const r = Math.random();
        if (r < 0.65) return "ambush";
        if (r < 0.80) return "patrol";
        if (r < 0.92) return "traveler";
        return "discovery";
      }
      return weightedKind();
    }
    const kind = pickKind();
    const now = new Date().toISOString();

    // Brief flavor when cargo provoked the encounter.
    const cargoFlavor = cargoValue > 200 && kind === "ambush"
      ? " *Your cargo's weight has marked you on this road.*" : "";

    if (kind === "ambush") {
      const t = pick(AMBUSH_NPCS);
      const { data: npc } = await admin.from("npcs").insert({
        name: t.name, title: t.title, persona: "ambusher",
        greeting: t.greeting, room, home_room: room,
      }).select("id, name").single();
      await admin.from("messages").insert({
        room, author_name: "—", kind: "ambient",
        content: `*${t.name}, ${t.title}, steps from cover, blocking the road.*${cargoFlavor} "${t.greeting}"`,
        user_id: null,
      });

      // Auto-start combat if the player and room are free.
      const { data: existing } = await admin.from("combats")
        .select("id").eq("room", room).eq("status", "active").maybeSingle();
      if (!existing && !profile.in_combat_id) {
        const { data: prof2 } = await admin.from("profiles")
          .select("hp, max_hp, username").eq("id", user.id).maybeSingle();
        const playerHp = prof2?.hp ?? 20;
        const playerMax = prof2?.max_hp ?? 20;
        const npcMax = 12 + SR(8);
        const playerInit = 10 + SR(10);
        const npcInit = 12 + SR(10); // ambushers get the jump
        const npcFirst = npcInit >= playerInit;
        const { data: combat } = await admin.from("combats").insert({
          room, status: "active", turn_number: 1,
        }).select("id").single();
        const { data: combatants } = await admin.from("combatants").insert([
          { combat_id: combat!.id, side: "a", kind: "player", user_id: user.id,
            name: prof2?.username ?? "you", hp: playerHp, max_hp: playerMax,
            initiative: playerInit, turn_order: npcFirst ? 1 : 0 },
          { combat_id: combat!.id, side: "b", kind: "npc", npc_id: npc!.id,
            name: npc!.name, hp: npcMax, max_hp: npcMax,
            initiative: npcInit, turn_order: npcFirst ? 0 : 1 },
        ]).select("id, turn_order");
        const ordered = (combatants ?? []).sort((a: any, b: any) => a.turn_order - b.turn_order);
        const playerCombatant = ordered.find((c: any) => c.turn_order === (npcFirst ? 1 : 0))!;
        const npcCombatant = ordered.find((c: any) => c.turn_order === (npcFirst ? 0 : 1))!;
        await admin.from("profiles").update({ in_combat_id: combat!.id, last_encounter_at: now }).eq("id", user.id);
        await admin.from("combat_actions").insert({
          combat_id: combat!.id, turn_number: 1, actor_id: null,
          actor_name: npc!.name, action: "system", target_name: prof2?.username ?? "you",
          text: `${npc!.name} springs the ambush!`, damage: 0,
        });

        // If the NPC won initiative, resolve their opening strike inline so the
        // player isn't stuck waiting for an NPC turn that nothing drives.
        if (npcFirst) {
          const dmg = Math.max(1, 2 + SR(4));
          const newHp = Math.max(0, playerHp - dmg);
          const downed = newHp <= 0;
          await admin.from("combatants").update({ hp: newHp, defeated: downed }).eq("id", playerCombatant.id);
          await admin.from("profiles").update({
            hp: newHp, last_damage_kind: "physical",
            ...(downed ? { downed: true, downed_at: new Date().toISOString(), downed_combat_id: combat!.id } : {}),
          }).eq("id", user.id);
          await admin.from("combat_actions").insert({
            combat_id: combat!.id, turn_number: 1, actor_id: null,
            actor_name: npc!.name, action: "attack", target_name: prof2?.username ?? "you",
            text: `${npc!.name} strikes ${prof2?.username ?? "you"} for ${dmg} damage.${downed ? " You fall!" : ""}`,
            damage: dmg,
          });
          await admin.from("messages").insert({
            room, user_id: null, author_name: "—", kind: "system",
            content: `⚔ ${npc!.name} strikes ${prof2?.username ?? "you"} for ${dmg} damage.${downed ? " You fall!" : ""}`,
          });
        }
        // Hand the turn to the player either way.
        await admin.from("combats").update({ current_combatant_id: playerCombatant.id }).eq("id", combat!.id);
        return json({ ok: true, kind, npc_id: npc?.id, npc_name: npc?.name, combat_id: combat!.id });
      }
      await admin.from("profiles").update({ last_encounter_at: now }).eq("id", user.id);
      return json({ ok: true, kind, npc_id: npc?.id, npc_name: npc?.name });
    }

    if (kind === "traveler") {
      const t = pick(TRAVELERS);
      const dest = pick(CAPITAL_DESTINATIONS);
      const plea = t.plea.replace("%DEST%", dest.name);
      const { data: npc } = await admin.from("npcs").insert({
        name: t.name, title: t.title, persona: "traveler",
        greeting: plea, room, home_room: dest.slug,
      }).select("id, name").single();
      // Create the offered escort quest so the player accepts/declines via the journal UI.
      const { data: quest } = await admin.from("quests").insert({
        user_id: user.id,
        giver_npc_id: npc!.id,
        giver_npc_name: t.name,
        title: `Escort ${t.name} to ${dest.name}`,
        description: plea,
        objective: `Reach ${dest.name} with ${t.name} alive.`,
        status: "offered",
        severity: "minor",
        kind: "escort",
        target_kind: "room",
        target_ref: dest.slug,
        reward_gold: 30 + Math.floor(Math.random() * 30),
        reward_xp: 60,
        reward_amity: 8,
        offered_room: room,
        escort_npc_id: npc!.id,
      }).select("id").single();
      await admin.from("messages").insert({
        room, author_name: "—", kind: "ambient",
        content: `*${t.name}, a ${t.title}, hails you from the roadside.* "${plea}"`,
        user_id: null,
      });
      await admin.from("profiles").update({ last_encounter_at: now }).eq("id", user.id);
      return json({
        ok: true, kind, npc_id: npc?.id, npc_name: t.name,
        destination: dest.slug, destination_name: dest.name, quest_id: quest?.id,
      });
    }

    if (kind === "patrol") {
      const t = pick(PATROLS);
      const { data: npc } = await admin.from("npcs").insert({
        name: t.name, title: t.title, persona: "patrol",
        greeting: t.greeting, room, home_room: room,
      }).select("id, name").single();
      await admin.from("messages").insert({
        room, author_name: "—", kind: "ambient",
        content: `*${t.name}, ${t.title}, reins up beside you.* "${t.greeting}"`,
        user_id: null,
      });
      await admin.from("profiles").update({ last_encounter_at: now }).eq("id", user.id);
      return json({ ok: true, kind, npc_id: npc?.id, npc_name: t.name });
    }

    // discovery
    const d = pick(DISCOVERIES);
    await admin.from("messages").insert({
      room, author_name: "—", kind: "ambient",
      content: d.line, user_id: null,
    });
    if (d.reward.kind === "gold") {
      await admin.from("profiles").update({
        gold: (profile.gold ?? 0) + d.reward.amount,
        last_encounter_at: now,
      }).eq("id", user.id);
    } else {
      await admin.from("profiles").update({
        xp: (profile.xp ?? 0) + d.reward.amount,
        last_encounter_at: now,
      }).eq("id", user.id);
    }
    return json({ ok: true, kind, reward: d.reward });
  } catch (e) {
    console.error("random-encounter error", e);
    return json({ error: e instanceof Error ? e.message : "error" }, 500);
  }
});
