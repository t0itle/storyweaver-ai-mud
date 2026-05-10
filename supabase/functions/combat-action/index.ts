import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const ok = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

type Pt = [number, number];
type Body = {
  action: "start" | "join" | "attack" | "defend" | "cast" | "cast_lesser" | "interrupt" | "flee" | "death_save";
  target_name?: string;
  target_kind?: "npc" | "player";
  combat_id?: string;
  rune_key?: string;
  cast_item_id?: string;
  stroke?: Pt[];           // for cast_lesser
  trace_score?: number;    // optional client-reported score (server re-scores anyway)
};

// === $1 unistroke (mirrors lesser-rune-cast) ===
const N = 64; const HALF_DIAGONAL = 0.5 * Math.SQRT2;
const ANGLE_RANGE = (45 * Math.PI) / 180; const ANGLE_PRECISION = (2 * Math.PI) / 180;
const PHI = 0.5 * (-1 + Math.sqrt(5));
const dist = (a: Pt, b: Pt) => Math.hypot(a[0]-b[0], a[1]-b[1]);
function pathLen(p: Pt[]) { let d=0; for (let i=1;i<p.length;i++) d+=dist(p[i-1],p[i]); return d; }
function resample(p: Pt[], n: number): Pt[] {
  if (p.length<2) return p.slice();
  const I = pathLen(p)/(n-1); let D=0; const out: Pt[]=[p[0]]; const pts=p.slice();
  for (let i=1;i<pts.length;i++) {
    const d = dist(pts[i-1], pts[i]);
    if (D+d>=I) { const qx=pts[i-1][0]+((I-D)/d)*(pts[i][0]-pts[i-1][0]);
      const qy=pts[i-1][1]+((I-D)/d)*(pts[i][1]-pts[i-1][1]);
      const q: Pt=[qx,qy]; out.push(q); pts.splice(i,0,q); D=0;
    } else D+=d;
  }
  while (out.length<n) out.push(pts[pts.length-1]); return out;
}
function centroid(p: Pt[]): Pt { let x=0,y=0; for (const q of p){x+=q[0];y+=q[1];} return [x/p.length,y/p.length]; }
function rotateBy(p: Pt[], r: number): Pt[] { const c=centroid(p); const cs=Math.cos(r),sn=Math.sin(r);
  return p.map(q=>[(q[0]-c[0])*cs-(q[1]-c[1])*sn+c[0],(q[0]-c[0])*sn+(q[1]-c[1])*cs+c[1]] as Pt); }
function scaleTo(p: Pt[], s: number): Pt[] { let mnX=Infinity,mxX=-Infinity,mnY=Infinity,mxY=-Infinity;
  for (const q of p){if(q[0]<mnX)mnX=q[0];if(q[0]>mxX)mxX=q[0];if(q[1]<mnY)mnY=q[1];if(q[1]>mxY)mxY=q[1];}
  const w=mxX-mnX||1,h=mxY-mnY||1; return p.map(q=>[(q[0]-mnX)*(s/w),(q[1]-mnY)*(s/h)] as Pt); }
function translateTo(p: Pt[], t: Pt): Pt[] { const c=centroid(p); return p.map(q=>[q[0]+t[0]-c[0],q[1]+t[1]-c[1]] as Pt); }
function pathDistance(a: Pt[], b: Pt[]) { let d=0; const n=Math.min(a.length,b.length);
  for (let i=0;i<n;i++) d+=dist(a[i],b[i]); return d/n; }
function distAtAngle(p: Pt[], t: Pt[], r: number) { return pathDistance(rotateBy(p,r),t); }
function distAtBest(p: Pt[], t: Pt[]) { let a=-ANGLE_RANGE,b=ANGLE_RANGE;
  let x1=PHI*a+(1-PHI)*b; let f1=distAtAngle(p,t,x1);
  let x2=(1-PHI)*a+PHI*b; let f2=distAtAngle(p,t,x2);
  while (Math.abs(b-a)>ANGLE_PRECISION) {
    if (f1<f2){b=x2;x2=x1;f2=f1;x1=PHI*a+(1-PHI)*b;f1=distAtAngle(p,t,x1);}
    else {a=x1;x1=x2;f1=f2;x2=(1-PHI)*a+PHI*b;f2=distAtAngle(p,t,x2);}
  } return Math.min(f1,f2);
}
function preprocess(r: Pt[]): Pt[] { let p=resample(r,N);
  const ang=Math.atan2(centroid(p)[1]-p[0][1], centroid(p)[0]-p[0][0]);
  p=rotateBy(p,-ang); p=scaleTo(p,1); p=translateTo(p,[0,0]); return p; }
function scoreStroke(drawn: Pt[], tpl: Pt[]): number {
  if (drawn.length<4||tpl.length<2) return 0;
  return Math.max(0, 1 - distAtBest(preprocess(drawn), preprocess(tpl))/HALF_DIAGONAL);
}

// === AI narration ===
async function narrateLine(args: {
  actor: string; verb: "strikes" | "casts" | "defends" | "is_struck"; target?: string;
  weapon?: string; armor?: string; rune?: string; runeGlyph?: string;
  damage?: number; outcome?: string; defeated?: boolean;
}): Promise<string | null> {
  const key = Deno.env.get("LOVABLE_API_KEY"); if (!key) return null;
  const sys = `You are a combat narrator for EverBloom, a dark fantasy world. Output ONE vivid sentence (max 28 words), present tense, third person, no second-person, no game numbers, no quest hooks. End with a hard period.

STRICT RULES — DO NOT VIOLATE:
- Use the EXACT actor and target names provided. Never invent factions, titles, races, or identities (do NOT call anyone "Veiled", "cultist", "warden", "guard", etc. unless that word appears in the provided name).
- Only mention a weapon if a "Weapon:" line is given. If none is given, describe the strike with bare hands, fists, or unarmed motion — NEVER name a sword, blade, dagger, axe, bow, staff, etc.
- Only mention armor if an "Armor:" line is given. If none is given, do NOT describe armor, mail, plate, robes, etc.
- Only mention a rune if a "Rune:" line is given.`;
  const lines: string[] = [`Actor: ${args.actor}`, `Action: ${args.verb}${args.target ? ` ${args.target}` : ""}`];
  if (args.weapon) lines.push(`Weapon: ${args.weapon}`);
  else lines.push(`Weapon: none (unarmed — bare hands/fists only)`);
  if (args.armor) lines.push(`Armor: ${args.armor}`);
  if (args.rune) lines.push(`Rune: ${args.runeGlyph ?? ""} ${args.rune}`);
  if (typeof args.damage === "number") lines.push(`Damage dealt: ${args.damage}`);
  if (args.outcome) lines.push(`Trace outcome: ${args.outcome}`);
  if (args.defeated) lines.push(`Result: target falls`);
  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: sys }, { role: "user", content: lines.join("\n") }],
      }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const t = j.choices?.[0]?.message?.content?.trim();
    if (!t) return null;
    return t.replace(/^["'\s]+|["'\s]+$/g, "").slice(0, 240);
  } catch { return null; }
}

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
      let weaponName: string | null = null;
      const armorPieces: string[] = [];
      for (const pi of (items ?? []) as any[]) {
        const slot = pi.equipped_slot;
        const baseD = pi.items.base_damage ?? 0;
        const baseA = pi.items.base_armor ?? 0;
        dmg += baseD; armor += baseA;
        if ((slot === "main_hand" || slot === "off_hand") && (baseD > 0 || !weaponName)) weaponName = pi.items.name;
        if (baseA > 0) armorPieces.push(pi.items.name);
        for (const ir of pi.item_runes ?? []) {
          const eff = ir.runes?.effect ?? {};
          if (eff.type === "damage_bonus") dmg += eff.value;
          if (eff.type === "armor_bonus") armor += eff.value;
          if (eff.type === "max_hp") hpBonus += eff.value;
        }
      }
      return { prof, dmg, armor, hpBonus, weaponName, armorName: armorPieces.join(", ") || null };
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
      let targetGear: { armor: number; weaponName: string | null; armorName: string | null } = { armor: 0, weaponName: null, armorName: null };
      if (target.kind === "player") targetGear = await playerStats(target.user_id);
      const final = Math.max(1, dmg - targetGear.armor - (target.defending ? 2 : 0));
      const newHp = Math.max(0, target.hp - final);
      const wouldDie = newHp <= 0;
      // Players don't die on the spot — they're DOWNED and get a death save.
      // They're still defeated for combat math (no more turns), but their profile stays alive pending the trace.
      const defeated = wouldDie;
      await admin.from("combatants").update({ hp: newHp, defeated }).eq("id", target.id);
      if (target.kind === "player") {
        await admin.from("profiles").update({ hp: newHp, last_damage_kind: "physical" }).eq("id", target.user_id);
        if (wouldDie) {
          await admin.from("profiles").update({
            downed: true, downed_at: new Date().toISOString(), downed_combat_id: combatId,
          }).eq("id", target.user_id);
        }
      }
      const fallback = `${npc.name} strikes ${target.name} for ${final} damage.${defeated ? ` ${target.name} falls!` : ""}`;
      const ai = await narrateLine({
        actor: npc.name, verb: "strikes", target: target.name,
        armor: targetGear.armorName ?? undefined,
        damage: final, defeated,
      });
      await pushAction(combatId, combat!.turn_number, null, npc.name, "attack", target.name, ai ?? fallback, final);
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
        const nowIso = new Date().toISOString();
        const { data: npcs } = await admin.from("npcs").select("*")
          .eq("room", profile.current_room)
          .or(`dead_until.is.null,dead_until.lte.${nowIso}`);
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
    const combatId = body.combat_id ?? profile.in_combat_id ?? profile.downed_combat_id;
    if (!combatId) throw new Error("You are not in a fight.");
    const { data: combat } = await admin.from("combats").select("*").eq("id", combatId).maybeSingle();
    if (!combat) throw new Error("That fight has ended.");
    const { data: combatants } = await admin.from("combatants").select("*").eq("combat_id", combatId);
    const me = (combatants ?? []).find((c: any) => c.user_id === user.id);
    if (!me) throw new Error("You are not in this fight.");

    // ===== DEATH_SAVE (life-saving rune trace from a downed player) =====
    if (body.action === "death_save") {
      if (!profile.downed) throw new Error("You are not downed.");
      if (profile.dead) throw new Error("You are already dead.");
      const stroke = Array.isArray(body.stroke) ? body.stroke as Pt[] : [];
      // Use a default lesser rune as the death-save shape if available, else just score-by-length
      let score = 0;
      if (stroke.length >= 6) {
        const { data: rune } = await admin.from("lesser_runes").select("template").eq("key", body.rune_key ?? "vita").maybeSingle();
        const tpl = (rune?.template as Pt[] | undefined) ?? null;
        if (tpl && tpl.length >= 2) {
          score = Math.max(scoreStroke(stroke, tpl), scoreStroke(stroke, [...tpl].reverse()));
        } else {
          // No template — score by stroke completion (≥40 points = pass)
          score = Math.min(1, stroke.length / 60);
        }
      }
      const passed = score >= 0.55;
      if (passed) {
        const reviveHp = Math.max(2, Math.floor((profile.max_hp ?? 20) * 0.15));
        await admin.from("profiles").update({
          downed: false, downed_at: null, downed_combat_id: null,
          hp: reviveHp, in_combat_id: null,
        }).eq("id", user.id);
        await admin.from("combatants").update({ defeated: true }).eq("id", me.id);
        await pushAction(combatId, combat.turn_number, user.id, me.name, "death_save", null,
          `${me.name} claws back from the brink (${Math.round(score * 100)}%) and reels out of the fight!`);
        await advanceTurn(combatId);
        return ok({ ok: true, saved: true, hp: reviveHp });
      } else {
        // Permadeath — UNLESS the player is aligned to a still-living Aether.
        // Aligned faithful are carried to their Aether's city well at half HP.
        let alignedRescue: { well: string; aether: string; aetherName: string } | null = null;
        if (profile.aether) {
          const { data: aeRow } = await admin
            .from("aethers")
            .select("key, name, alive, well_room")
            .eq("key", profile.aether)
            .maybeSingle();
          if (aeRow?.alive && aeRow.well_room) {
            alignedRescue = { well: aeRow.well_room as string, aether: aeRow.key as string, aetherName: (aeRow.name as string) ?? aeRow.key };
          }
        }

        if (alignedRescue) {
          const halfHp = Math.max(1, Math.floor((profile.max_hp ?? 20) / 2));
          await admin.from("profiles").update({
            downed: false, downed_at: null, downed_combat_id: null,
            dead: false, dead_at: null, death_room: null,
            hp: halfHp, in_combat_id: null,
            current_room: alignedRescue.well,
          }).eq("id", user.id);
          await admin.from("combatants").update({ defeated: true }).eq("id", me.id);
          await pushAction(combatId, combat.turn_number, user.id, me.name, "death_save", null,
            `${me.name}'s breath fails (${Math.round(score * 100)}%) — but ${alignedRescue.aetherName} answers. They wake at the city well, half their strength returned.`);
          await admin.from("world_events").insert({
            kind: "aether_rescued", actor_id: user.id, actor_name: me.name,
            room: alignedRescue.well, target_kind: "aether", target_name: alignedRescue.aether,
            details: { from: profile.current_room, aether: alignedRescue.aether },
          });
          await advanceTurn(combatId);
          return ok({ ok: true, saved: true, rescued: true, hp: halfHp, room: alignedRescue.well });
        }

        // Permadeath
        await admin.from("profiles").update({
          downed: false, downed_at: null, downed_combat_id: null,
          dead: true, dead_at: new Date().toISOString(),
          death_room: profile.current_room, hp: 0, in_combat_id: null,
        }).eq("id", user.id);
        await admin.from("combatants").update({ defeated: true }).eq("id", me.id);
        await pushAction(combatId, combat.turn_number, user.id, me.name, "death_save", null,
          `${me.name}'s hand fails the sigil (${Math.round(score * 100)}%). The breath leaves them. **${me.name} is dead.**`);
        await admin.from("world_events").insert({
          kind: "died", actor_id: user.id, actor_name: me.name,
          room: profile.current_room, details: { combat_id: combatId, score: Math.round(score * 100) },
        });
        await advanceTurn(combatId);
        return ok({ ok: true, saved: false, dead: true });
      }
    }

    if (combat.status !== "active") throw new Error("That fight has ended.");
    if (combat.current_combatant_id !== me.id) {
      // Interrupt is a timer-driven side effect — silently no-op if the turn already moved on.
      if (body.action === "interrupt") return ok({ ok: true, skipped: true });
      throw new Error("It is not your turn.");
    }

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
      const targetArmorName = target.kind === "player" ? (await playerStats(target.user_id)).armorName : null;
      const fallback = `${me.name} strikes ${target.name} for ${final} damage.${defeated ? ` ${target.name} falls!` : ""}`;
      const ai = await narrateLine({
        actor: me.name, verb: "strikes", target: target.name,
        weapon: stats.weaponName ?? undefined,
        armor: targetArmorName ?? undefined,
        damage: final, defeated,
      });
      await pushAction(combatId, combat.turn_number, user.id, me.name, "attack", target.name, ai ?? fallback, final);
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
        // === Quest auto-resolution: any active "slay" quest targeting this NPC completes. ===
        const { data: slayQuests } = await admin.from("quests")
          .select("id,target_ref")
          .eq("user_id", user.id).eq("status", "active")
          .eq("kind", "slay").eq("target_kind", "npc");
        const matchedSlay = (slayQuests ?? []).filter((q: any) => {
          const ref = String(q.target_ref ?? "").toLowerCase();
          if (!ref) return false;
          return ref === String(target.npc_id ?? "").toLowerCase()
              || target.name.toLowerCase().includes(ref)
              || ref.includes(target.name.toLowerCase());
        });
        for (const q of matchedSlay) {
          const auth = req.headers.get("Authorization");
          if (!auth) continue;
          await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/quest-award`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: auth },
            body: JSON.stringify({ quest_id: q.id, note: "auto:slay" }),
          }).catch(() => null);
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
      const aiCast = await narrateLine({
        actor: me.name, verb: "casts",
        rune: chosen.ir.runes.name, runeGlyph: chosen.ir.runes.glyph,
      });
      await pushAction(combatId, combat.turn_number, user.id, me.name, "cast", null, aiCast ? `${aiCast} (${text})` : text);
      await advanceTurn(combatId);
      return ok({ ok: true });
    }

    // ===== CAST_LESSER (timed traced rune in combat) =====
    if (body.action === "cast_lesser") {
      if (!body.rune_key || !Array.isArray(body.stroke) || body.stroke.length < 6) {
        throw new Error("Trace required to weave a lesser rune.");
      }
      const { data: rune } = await admin.from("lesser_runes").select("*").eq("key", body.rune_key).maybeSingle();
      if (!rune) throw new Error("No such rune.");
      const { data: kn } = await admin.from("player_lesser_rune_knowledge")
        .select("knows_word, knows_symbol").eq("user_id", user.id).eq("rune_key", body.rune_key).maybeSingle();
      if (!kn?.knows_word || !kn?.knows_symbol) throw new Error(`You have not yet bound the rune ${rune.latin_name}.`);

      const tpl = rune.template as Pt[];
      const score = Math.max(scoreStroke(body.stroke as Pt[], tpl), scoreStroke(body.stroke as Pt[], [...tpl].reverse()));
      const eff = (rune.effect ?? {}) as Record<string, any>;
      const enemies = (combatants ?? []).filter((c: any) => c.side !== me.side && !c.defeated);

      let text = ""; let damage = 0; let healed = 0;
      let outcome: "perfect" | "weakened" | "fizzle" | "backfire" = "fizzle";
      if (score >= 0.85) outcome = "perfect";
      else if (score >= 0.6) outcome = "weakened";
      else if (score >= 0.35) outcome = "fizzle";
      else outcome = "backfire";

      if (eff.type === "heal") {
        const base = eff.power ?? 6;
        healed = outcome === "perfect" ? base : outcome === "weakened" ? Math.max(1, Math.round(base * 0.5)) : 0;
        const newHp = Math.min(me.max_hp, me.hp + healed);
        await admin.from("combatants").update({ hp: newHp }).eq("id", me.id);
        await admin.from("profiles").update({ hp: newHp }).eq("id", user.id);
        text = `${me.name} traces ${rune.glyph} ${rune.latin_name} (${Math.round(score*100)}%). Skin knits — +${healed} HP.`;
      } else {
        const target = body.target_name
          ? (enemies.find((e: any) => e.name.toLowerCase().startsWith(body.target_name!.toLowerCase())) ?? enemies[0])
          : enemies[0];
        if (!target && outcome !== "backfire") throw new Error("No target.");
        const base = eff.power ?? 6;
        damage = outcome === "perfect" ? base + SR(3)
               : outcome === "weakened" ? Math.max(1, Math.round(base * 0.5))
               : 0;
        if (target && damage > 0) {
          const newHp = Math.max(0, target.hp - damage);
          const defeated = newHp <= 0;
          await admin.from("combatants").update({ hp: newHp, defeated }).eq("id", target.id);
          if (target.kind === "player") await admin.from("profiles").update({ hp: newHp }).eq("id", target.user_id);
          text = `${me.name} hurls ${rune.glyph} ${rune.latin_name} at ${target.name} (${Math.round(score*100)}%) — ${damage} damage.${defeated ? ` ${target.name} falls!` : ""}`;
        } else if (outcome === "backfire") {
          const back = 2 + SR(3);
          const newHp = Math.max(0, me.hp - back);
          await admin.from("combatants").update({ hp: newHp }).eq("id", me.id);
          await admin.from("profiles").update({ hp: newHp, corruption: (profile.corruption ?? 0) + 1 }).eq("id", user.id);
          text = `${me.name}'s ${rune.glyph} ${rune.latin_name} unravels and bites back — ${back} damage.`;
        } else {
          text = `${me.name}'s ${rune.glyph} ${rune.latin_name} hangs broken in the air, then unravels.`;
        }
      }

      const aiLesser = await narrateLine({
        actor: me.name, verb: "casts", target: body.target_name ?? undefined,
        rune: rune.latin_name, runeGlyph: rune.glyph,
        weapon: stats.weaponName ?? undefined,
        damage: damage || undefined, outcome,
      });
      await pushAction(combatId, combat.turn_number, user.id, me.name, "cast_lesser", body.target_name ?? null,
        aiLesser ? `${aiLesser} (${text})` : text, damage);

      // Mastery
      await admin.from("player_lesser_runes").upsert({
        user_id: user.id, rune_key: body.rune_key,
        best_score: score, cast_count: 1,
        backfire_count: outcome === "backfire" ? 1 : 0,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,rune_key" });

      await advanceTurn(combatId);
      return ok({ ok: true, score: Math.round(score * 100), outcome, damage, healed });
    }

    // ===== INTERRUPT (player ran out of trace time — foe gets a free swing) =====
    if (body.action === "interrupt") {
      const enemies = (combatants ?? []).filter((c: any) => c.side !== me.side && !c.defeated);
      const foe = enemies[SR(enemies.length)];
      if (foe) {
        const dmg = 2 + SR(4);
        const final = Math.max(1, dmg - stats.armor);
        const newHp = Math.max(0, me.hp - final);
        await admin.from("combatants").update({ hp: newHp }).eq("id", me.id);
        await admin.from("profiles").update({ hp: newHp }).eq("id", user.id);
        const aiInt = await narrateLine({
          actor: foe.name, verb: "strikes", target: me.name,
          armor: stats.armorName ?? undefined,
          damage: final, outcome: "interrupt",
        });
        await pushAction(combatId, combat.turn_number, null, foe.name, "interrupt", me.name,
          aiInt ?? `${me.name}'s hand falters mid-trace — ${foe.name} drives in for ${final} damage.`, final);
      }
      // Player's turn stays open; they may try again or attack/defend.
      return ok({ ok: true, interrupted: true });
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
