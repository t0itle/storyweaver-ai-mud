import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const ok = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

type Body = {
  action: "start" | "join" | "attack" | "defend" | "cast" | "flee";
  target_name?: string;          // npc/player name (for start, attack)
  target_kind?: "npc" | "player";
  combat_id?: string;
  rune_key?: string;             // for cast
  cast_item_id?: string;         // which item (focus) to spend a charge from
};

const SR = (n: number) => Math.floor(Math.random() * n);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return ok({ error: "Unauthorized" }, 401);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } });
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return ok({ error: "Unauthorized" }, 401);

    const body = await req.json() as Body;

    const { data: profile } = await admin.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (!profile) throw new Error("Profile missing");

    // helpers
    const playerStats = async (uid: string) => {
      const { data: prof } = await admin.from("profiles").select("hp,max_hp,username,race").eq("id", uid).maybeSingle();
      const { data: items } = await admin.from("player_items").select("*, items(*), item_runes(*, runes(*))")
        .eq("user_id", uid).not("equipped_slot", "is", null);
      let dmg = 1, armor = 0, hpBonus = 0;
      for (const pi of (items ?? []) as any[]) {
        dmg += pi.items.base_damage ?? 0;
        armor += pi.items.base_armor ?? 0;
        for (const ir of pi.item_runes ?? []) {
          const eff = ir.runes?.effect ?? {};
          if (eff.type === "damage_bonus") dmg += eff.value;
          if (eff.type === "armor_bonus") armor += eff.value;
          if (eff.type === "max_hp") hpBonus += eff.value;
        }
      }
      return { prof, dmg, armor, hpBonus };
    };

    const pushAction = async (combatId: string, turn: number, actorId: string | null, actorName: string,
                              act: string, targetName: string | null, text: string, damage = 0) => {
      await admin.from("combat_actions").insert({
        combat_id: combatId, turn_number: turn, actor_id: actorId,
        actor_name: actorName, action: act, target_name: targetName, text, damage,
      });
      await admin.from("messages").insert({
        room: profile.current_room, user_id: null, author_name: "—", kind: "system",
        content: `⚔ ${text}`,
      });
    };

    const advanceTurn = async (combatId: string) => {
      const { data: combat } = await admin.from("combats").select("*").eq("id", combatId).maybeSingle();
      const { data: list } = await admin.from("combatants").select("*").eq("combat_id", combatId).order("turn_order");
      const alive = (list ?? []).filter((c: any) => !c.defeated);
      const sideA = alive.filter((c: any) => c.side === "a").length;
      const sideB = alive.filter((c: any) => c.side === "b").length;
      if (sideA === 0 || sideB === 0) {
        const winner = sideA > 0 ? "a" : "b";
        await admin.from("combats").update({ status: "ended", winner_side: winner, ended_at: new Date().toISOString() }).eq("id", combatId);
        // clear in_combat_id on player combatants
        const playerIds = (list ?? []).filter((c: any) => c.kind === "player").map((c: any) => c.user_id);
        if (playerIds.length) await admin.from("profiles").update({ in_combat_id: null }).in("id", playerIds);
        await pushAction(combatId, combat!.turn_number, null, "—", "system", null,
          `The fight ends. Side ${winner.toUpperCase()} stands.`);
        return;
      }
      // find next combatant after current
      const ordered = (list ?? []).sort((a: any, b: any) => a.turn_order - b.turn_order);
      const curIdx = ordered.findIndex((c: any) => c.id === combat!.current_combatant_id);
      let nextIdx = curIdx;
      for (let i = 1; i <= ordered.length; i++) {
        const n = (curIdx + i) % ordered.length;
        if (!ordered[n].defeated) { nextIdx = n; break; }
      }
      const next = ordered[nextIdx];
      const newTurnNumber = nextIdx <= curIdx ? combat!.turn_number + 1 : combat!.turn_number;
      await admin.from("combats").update({ current_combatant_id: next.id, turn_number: newTurnNumber }).eq("id", combatId);
      // reset defending of next
      await admin.from("combatants").update({ defending: false }).eq("id", next.id);

      // If next is NPC, run its turn immediately
      if (next.kind === "npc") {
        await runNpcTurn(combatId, next.id);
      }
    };

    const runNpcTurn = async (combatId: string, npcCombatantId: string) => {
      const { data: combat } = await admin.from("combats").select("*").eq("id", combatId).maybeSingle();
      const { data: list } = await admin.from("combatants").select("*").eq("combat_id", combatId);
      const npc = (list ?? []).find((c: any) => c.id === npcCombatantId)!;
      const enemies = (list ?? []).filter((c: any) => c.side !== npc.side && !c.defeated);
      if (enemies.length === 0) { await advanceTurn(combatId); return; }
      const target = enemies[SR(enemies.length)];
      const dmg = 2 + SR(4);
      const final = Math.max(1, dmg - (target.kind === "player" ? (await playerStats(target.user_id)).armor : 0) - (target.defending ? 2 : 0));
      const newHp = Math.max(0, target.hp - final);
      const defeated = newHp <= 0;
      await admin.from("combatants").update({ hp: newHp, defeated }).eq("id", target.id);
      if (target.kind === "player") {
        await admin.from("profiles").update({ hp: newHp }).eq("id", target.user_id);
      }
      await pushAction(combatId, combat!.turn_number, null, npc.name, "attack", target.name,
        `${npc.name} strikes ${target.name} for ${final} damage.${defeated ? ` ${target.name} falls!` : ""}`, final);
      await advanceTurn(combatId);
    };

    // ===== START =====
    if (body.action === "start") {
      if (profile.in_combat_id) throw new Error("You are already in a fight.");
      if (!body.target_name) throw new Error("Attack whom?");
      // existing combat in this room?
      const { data: existing } = await admin.from("combats").select("id").eq("room", profile.current_room).eq("status", "active").maybeSingle();
      if (existing) throw new Error("A fight already rages here. Use 'join' to enter it.");

      // target must be in same room
      let target: any = null;
      const tname = body.target_name.toLowerCase();
      if (body.target_kind !== "player") {
        const { data: npcs } = await admin.from("npcs").select("*").eq("room", profile.current_room);
        target = (npcs ?? []).find((n: any) => n.name.toLowerCase().startsWith(tname));
      }
      if (!target && body.target_kind !== "npc") {
        const { data: profs } = await admin.from("profiles").select("*").eq("current_room", profile.current_room).neq("id", user.id);
        target = (profs ?? []).find((p: any) => p.username.toLowerCase().startsWith(tname));
        if (target) target.kind = "player";
      } else if (target) {
        target.kind = "npc";
      }
      if (!target) throw new Error(`No one called "${body.target_name}" is here to fight.`);

      const stats = await playerStats(user.id);
      const playerMaxHp = (stats.prof?.max_hp ?? 20) + stats.hpBonus;
      const playerHp = Math.min(stats.prof?.hp ?? 20, playerMaxHp);

      const { data: combat } = await admin.from("combats").insert({
        room: profile.current_room, status: "active", turn_number: 1,
      }).select().single();

      const targetHp = target.kind === "player" ? target.hp : 12 + SR(8);
      const targetMax = target.kind === "player" ? target.max_hp : targetHp;

      const playerInit = 10 + SR(10);
      const targetInit = 10 + SR(10);

      const { data: combatants } = await admin.from("combatants").insert([
        { combat_id: combat!.id, side: "a", kind: "player", user_id: user.id, name: profile.username,
          hp: playerHp, max_hp: playerMaxHp, initiative: playerInit, turn_order: playerInit >= targetInit ? 0 : 1 },
        { combat_id: combat!.id, side: "b", kind: target.kind, user_id: target.kind === "player" ? target.id : null,
          npc_id: target.kind === "npc" ? target.id : null, name: target.kind === "player" ? target.username : target.name,
          hp: targetHp, max_hp: targetMax, initiative: targetInit, turn_order: targetInit > playerInit ? 0 : 1 },
      ]).select();

      const first = (combatants ?? []).sort((a: any, b: any) => a.turn_order - b.turn_order)[0];
      await admin.from("combats").update({ current_combatant_id: first.id }).eq("id", combat!.id);
      await admin.from("profiles").update({ in_combat_id: combat!.id }).eq("id", user.id);
      if (target.kind === "player") {
        await admin.from("profiles").update({ in_combat_id: combat!.id }).eq("id", target.id);
      }

      await pushAction(combat!.id, 1, user.id, profile.username, "system", target.kind === "player" ? target.username : target.name,
        `${profile.username} draws steel against ${target.kind === "player" ? target.username : target.name}!`);

      // if NPC goes first, run its turn
      if (first.kind === "npc") await runNpcTurn(combat!.id, first.id);

      return ok({ ok: true, combat_id: combat!.id });
    }

    if (body.action === "join") {
      const { data: combat } = await admin.from("combats").select("*").eq("room", profile.current_room).eq("status", "active").maybeSingle();
      if (!combat) throw new Error("No fight here.");
      if (profile.in_combat_id) throw new Error("You are already in a fight.");
      const stats = await playerStats(user.id);
      const max = (stats.prof?.max_hp ?? 20) + stats.hpBonus;
      const init = 10 + SR(10);
      const { data: list } = await admin.from("combatants").select("turn_order").eq("combat_id", combat.id).order("turn_order", { ascending: false }).limit(1);
      const order = ((list?.[0]?.turn_order as number) ?? 0) + 1;
      await admin.from("combatants").insert({
        combat_id: combat.id, side: "a", kind: "player", user_id: user.id, name: profile.username,
        hp: Math.min(stats.prof!.hp, max), max_hp: max, initiative: init, turn_order: order,
      });
      await admin.from("profiles").update({ in_combat_id: combat.id }).eq("id", user.id);
      await pushAction(combat.id, combat.turn_number, user.id, profile.username, "system", null,
        `${profile.username} joins the fray on side A.`);
      return ok({ ok: true });
    }

    // For attack/defend/cast/flee — must be current actor's turn
    const combatId = body.combat_id ?? profile.in_combat_id;
    if (!combatId) throw new Error("You are not in a fight.");
    const { data: combat } = await admin.from("combats").select("*").eq("id", combatId).maybeSingle();
    if (!combat || combat.status !== "active") throw new Error("That fight has ended.");
    const { data: combatants } = await admin.from("combatants").select("*").eq("combat_id", combatId);
    const me = (combatants ?? []).find((c: any) => c.user_id === user.id);
    if (!me) throw new Error("You are not in this fight.");
    if (combat.current_combatant_id !== me.id) throw new Error("It is not your turn.");

    const stats = await playerStats(user.id);

    if (body.action === "attack") {
      const enemies = (combatants ?? []).filter((c: any) => c.side !== me.side && !c.defeated);
      if (!enemies.length) throw new Error("Nothing to strike.");
      let target = enemies[0];
      if (body.target_name) {
        const tn = body.target_name.toLowerCase();
        target = enemies.find((e: any) => e.name.toLowerCase().startsWith(tn)) ?? enemies[0];
      }
      const roll = SR(6) + 1;
      const raw = stats.dmg + roll;
      const enemyArmor = target.kind === "player" ? (await playerStats(target.user_id)).armor : 0;
      const final = Math.max(1, raw - enemyArmor - (target.defending ? 2 : 0));
      const newHp = Math.max(0, target.hp - final);
      const defeated = newHp <= 0;
      await admin.from("combatants").update({ hp: newHp, defeated, defending: false }).eq("id", target.id);
      if (target.kind === "player") {
        await admin.from("profiles").update({ hp: newHp }).eq("id", target.user_id);
      }
      await pushAction(combatId, combat.turn_number, user.id, me.name, "attack", target.name,
        `${me.name} strikes ${target.name} for ${final} damage.${defeated ? ` ${target.name} falls!` : ""}`, final);
      // XP/gold reward on kill (only against NPCs)
      if (defeated && target.kind === "npc") {
        const reward = 8 + SR(8); const goldReward = 3 + SR(8); const meritReward = 1 + SR(2);
        await admin.from("profiles").update({
          xp: (profile.xp ?? 0) + reward,
          gold: (profile.gold ?? 0) + goldReward,
          merit: (profile.merit ?? 0) + meritReward,
        }).eq("id", user.id);
        await admin.from("messages").insert({ room: profile.current_room, user_id: null, author_name: "—", kind: "system",
          content: `✦ ${me.name} gains ${reward} xp, ${goldReward} gold, and ${meritReward} merit.` });

        // === Adaptive storytelling: persist NPC death as a world event ===
        const { data: npcRow } = await admin.from("npcs").select("id,name,title,room").eq("id", target.npc_id).maybeSingle();
        if (npcRow) {
          // NPC stays dead for 3 days, tension decays after 14 days
          const deadUntil = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
          const decayAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
          await admin.from("npcs").update({ dead_until: deadUntil }).eq("id", npcRow.id);
          await admin.from("world_events").insert({
            room: profile.current_room,
            kind: "npc_killed",
            actor_id: user.id,
            actor_name: me.name,
            target_kind: "npc",
            target_id: npcRow.id,
            target_name: npcRow.name,
            details: { npc_title: npcRow.title ?? null, actor_race: profile.race ?? null, actor_aether: profile.aether ?? null },
            decay_at: decayAt,
          });
          await admin.from("messages").insert({
            room: profile.current_room, user_id: null, author_name: "—", kind: "system",
            content: `✶ A blood-mark settles on the stones. ${npcRow.name}'s name will be remembered — and so will ${me.name}'s.`,
          });
        }
      }
      await advanceTurn(combatId);
      return ok({ ok: true });
    }

    if (body.action === "defend") {
      await admin.from("combatants").update({ defending: true }).eq("id", me.id);
      await pushAction(combatId, combat.turn_number, user.id, me.name, "defend", null,
        `${me.name} sets stance, bracing for the next blow.`);
      await advanceTurn(combatId);
      return ok({ ok: true });
    }

    if (body.action === "cast") {
      if (!body.rune_key) throw new Error("Cast which rune?");
      // find a woven copy of this rune on any equipped item with charges
      const { data: equipped } = await admin.from("player_items").select("*, items(*), item_runes(*, runes(*))")
        .eq("user_id", user.id).not("equipped_slot", "is", null);
      let chosen: any = null;
      for (const pi of (equipped ?? []) as any[]) {
        for (const ir of pi.item_runes ?? []) {
          if (ir.rune_key === body.rune_key && ir.charges > 0) { chosen = { pi, ir }; break; }
        }
        if (chosen) break;
      }
      if (!chosen) throw new Error("No equipped item carries that rune with charges.");
      const eff = chosen.ir.runes.effect ?? {};
      const enemies = (combatants ?? []).filter((c: any) => c.side !== me.side && !c.defeated);
      let text = "";
      if (eff.type === "heal" || eff.target === "self") {
        const heal = eff.heal ?? 0;
        const newHp = Math.min(me.max_hp, me.hp + heal);
        await admin.from("combatants").update({ hp: newHp }).eq("id", me.id);
        await admin.from("profiles").update({ hp: newHp }).eq("id", user.id);
        text = `${me.name} traces ${chosen.ir.runes.glyph} ${chosen.ir.runes.name}. Skin knits — +${heal} HP.`;
      } else {
        if (!enemies.length) throw new Error("No target.");
        const target = body.target_name
          ? (enemies.find((e: any) => e.name.toLowerCase().startsWith(body.target_name!.toLowerCase())) ?? enemies[0])
          : enemies[0];
        const dmg = (eff.damage ?? 5) + SR(3);
        const newHp = Math.max(0, target.hp - dmg);
        const defeated = newHp <= 0;
        await admin.from("combatants").update({ hp: newHp, defeated }).eq("id", target.id);
        if (target.kind === "player") await admin.from("profiles").update({ hp: newHp }).eq("id", target.user_id);
        text = `${me.name} hurls ${chosen.ir.runes.glyph} ${chosen.ir.runes.name} at ${target.name} for ${dmg} damage.${defeated ? ` ${target.name} falls!` : ""}`;
      }
      await admin.from("item_runes").update({ charges: chosen.ir.charges - 1 }).eq("id", chosen.ir.id);
      await pushAction(combatId, combat.turn_number, user.id, me.name, "cast", null, text);
      await advanceTurn(combatId);
      return ok({ ok: true });
    }

    if (body.action === "flee") {
      if (SR(3) === 0) {
        await pushAction(combatId, combat.turn_number, user.id, me.name, "flee", null,
          `${me.name} tries to flee — and stumbles. The enemy lashes out!`);
        await advanceTurn(combatId);
      } else {
        await admin.from("combatants").update({ defeated: true }).eq("id", me.id);
        await admin.from("profiles").update({ in_combat_id: null }).eq("id", user.id);
        await pushAction(combatId, combat.turn_number, user.id, me.name, "flee", null,
          `${me.name} breaks away from the fight.`);
        await advanceTurn(combatId);
      }
      return ok({ ok: true });
    }

    return ok({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error(e);
    return ok({ error: e instanceof Error ? e.message : "error" }, 400);
  }
});
