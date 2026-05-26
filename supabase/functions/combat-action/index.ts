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
const BEAST_PATTERNS = /\b(wolf|hound|dog|cur|mastiff|bear|boar|drake|dragon|wyrm|wyvern|serpent|snake|viper|adder|spider|scorpion|rat|raven|crow|hawk|owl|eagle|hyena|lion|tiger|panther|cat|feline|ox|bull|stag|elk|horse|mare|stallion|beast|hound|jackal|fox|badger|moth|wasp|hornet|bee|toad|frog|leech|slug|worm|crab|eel|shark|octopus|kraken|insect|swarm|ape|gorilla)\b/i;
function inferBeastForm(name?: string | null, title?: string | null): string | null {
  const hay = `${name ?? ""} ${title ?? ""}`;
  const m = hay.match(BEAST_PATTERNS); if (!m) return null;
  return m[0].toLowerCase();
}
async function narrateLine(args: {
  actor: string; verb: "strikes" | "casts" | "defends" | "is_struck"; target?: string;
  weapon?: string; armor?: string; rune?: string; runeGlyph?: string;
  damage?: number; outcome?: string; defeated?: boolean;
  actorBeast?: string | null; targetBeast?: string | null;
}): Promise<string | null> {
  const key = Deno.env.get("LOVABLE_API_KEY"); if (!key) return null;
  const sys = `You are a combat narrator for EverBloom, a dark fantasy world. Output ONE vivid sentence (max 28 words), present tense, third person, no second-person, no game numbers, no quest hooks. End with a hard period.

STRICT RULES — DO NOT VIOLATE:
- Use the EXACT actor and target names provided. Never invent factions, titles, races, or identities (do NOT call anyone "Veiled", "cultist", "warden", "guard", etc. unless that word appears in the provided name).
- If a participant is marked as a BEAST, treat it strictly as that animal: it attacks with teeth, fangs, jaws, claws, talons, paws, hooves, horns, tail, or coils — whichever fits the species. NEVER give a beast hands, fists, knuckles, fingers, cloaks, hoods, robes, armor, weapons, or any human gear or speech.
- For non-beast actors: only mention a weapon if a "Weapon:" line is given. If none is given, describe the strike with bare hands, fists, or unarmed motion — NEVER name a sword, blade, dagger, axe, bow, staff, etc.
- Only mention armor if an "Armor:" line is given (and never for beasts). If none is given, do NOT describe armor, mail, plate, robes, etc.
- Only mention a rune if a "Rune:" line is given.`;
  const lines: string[] = [`Actor: ${args.actor}`, `Action: ${args.verb}${args.target ? ` ${args.target}` : ""}`];
  if (args.actorBeast) lines.push(`Actor form: BEAST — a ${args.actorBeast}. Attacks with natural anatomy only (fangs, claws, jaws, etc.).`);
  if (args.targetBeast) lines.push(`Target form: BEAST — a ${args.targetBeast}.`);
  if (args.actorBeast) {
    lines.push(`Weapon: none — beast uses its own body.`);
  } else if (args.weapon) lines.push(`Weapon: ${args.weapon}`);
  else lines.push(`Weapon: none (unarmed — bare hands/fists only)`);
  if (args.armor && !args.targetBeast) lines.push(`Armor: ${args.armor}`);
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
        const survivors = alive.map((c: any) => c.name).filter(Boolean).join(", ") || "the last fighter";
        const fallen = (list ?? []).filter((c: any) => c.defeated).map((c: any) => c.name).filter(Boolean).join(", ");
        const endTale = fallen
          ? `The clash settles. ${survivors} stand breathing over the stillness of ${fallen}.`
          : `The clash settles. ${survivors} remain, the fight gone out of the air.`;
        await pushAction(combatId, combat!.turn_number, null, "—", "system", null, endTale);
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
      // Damage: equipped weapon + str bonus, or boss explicit range, or default flailing.
      let dmgMin = 2, dmgRoll = 4;
      if (npc.npc_id) {
        const { data: nstat } = await admin.from("npcs")
          .select("is_boss, combat_damage_min, combat_damage_max, str, dex, level")
          .eq("id", npc.npc_id).maybeSingle();
        if (nstat?.is_boss && nstat.combat_damage_min && nstat.combat_damage_max) {
          dmgMin = nstat.combat_damage_min;
          dmgRoll = Math.max(1, nstat.combat_damage_max - nstat.combat_damage_min + 1);
        } else if (nstat) {
          // Look up equipped weapon, if any.
          const { data: gear } = await admin.from("npc_items")
            .select("item_key, equipped_slot, items:item_key(base_damage)")
            .eq("npc_id", npc.npc_id).eq("equipped_slot", "main_hand").maybeSingle();
          const weaponDmg = (gear as any)?.items?.base_damage ?? 0;
          const strBonus = Math.floor(((nstat.str ?? 10) - 10) / 2);
          const lvlBonus = Math.floor(((nstat.level ?? 1) - 1) / 2);
          dmgMin = Math.max(1, 1 + weaponDmg + strBonus + lvlBonus);
          dmgRoll = Math.max(2, 3 + Math.floor(weaponDmg / 2));
        }
      }
      const dmg = dmgMin + SR(dmgRoll);
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
      let actorTitle: string | null = null;
      if (npc.npc_id) {
        const { data: nrow } = await admin.from("npcs").select("title").eq("id", npc.npc_id).maybeSingle();
        actorTitle = nrow?.title ?? null;
      }
      const actorBeast = inferBeastForm(npc.name, actorTitle);
      const ai = await narrateLine({
        actor: npc.name, verb: "strikes", target: target.name,
        armor: actorBeast ? undefined : (targetGear.armorName ?? undefined),
        damage: final, defeated,
        actorBeast,
      });
      await pushAction(combatId, combat!.turn_number, null, npc.name, "attack", target.name, ai ?? fallback, final);
      await advanceTurn(combatId);
    };

    // Enroll the player's companion NPC on their side, if present in this room and not dead.
    // Returns the inserted combatant row, or null. NPC's permanent npcs.dead_until is NEVER changed by combat.
    const enrollCompanion = async (combatId: string, userId: string, side: "a" | "b") => {
      const { data: prof } = await admin.from("profiles")
        .select("companion_npc_id, current_room").eq("id", userId).maybeSingle();
      if (!prof?.companion_npc_id) return null;
      const nowIso = new Date().toISOString();
      const { data: comp } = await admin.from("npcs")
        .select("id, name, room, level, str, con, dex, combat_max_hp, is_boss, dead_until")
        .eq("id", prof.companion_npc_id).maybeSingle();
      if (!comp) return null;
      if (comp.room !== prof.current_room) return null;
      if (comp.dead_until && new Date(comp.dead_until) > new Date(nowIso)) return null;
      const conBonus = Math.max(0, Math.floor(((comp.con ?? 10) - 10) / 2));
      const lvlHp = Math.max(0, ((comp.level ?? 1) - 1)) * 4;
      const maxHp = comp.is_boss && comp.combat_max_hp ? comp.combat_max_hp : (18 + lvlHp + conBonus * 2);
      const init = 10 + SR(10) + Math.floor(((comp.dex ?? 10) - 10) / 2);
      const { data: row } = await admin.from("combatants").insert({
        combat_id: combatId, side, kind: "npc", npc_id: comp.id, name: comp.name,
        hp: maxHp, max_hp: maxHp, initiative: init, turn_order: 99,
      }).select().single();
      return row;
    };

    // Re-seat all combatants by initiative (desc) and reset current_combatant_id to the first alive one.
    const seatInitiative = async (combatId: string) => {
      const { data: list } = await admin.from("combatants").select("id,initiative,defeated").eq("combat_id", combatId);
      const sorted = (list ?? []).slice().sort((a: any, b: any) => (b.initiative ?? 0) - (a.initiative ?? 0));
      for (let i = 0; i < sorted.length; i++) {
        await admin.from("combatants").update({ turn_order: i }).eq("id", sorted[i].id);
      }
      const first = sorted.find((c: any) => !c.defeated) ?? sorted[0];
      if (first) await admin.from("combats").update({ current_combatant_id: first.id }).eq("id", combatId);
      return first;
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

      // === Sustained boss check: a risen bone-thing without its necromancer collapses. ===
      if (target.kind === "npc" && target.sustained_by_npc_id) {
        const { data: sustainer } = await admin.from("npcs")
          .select("id, dead_until, name").eq("id", target.sustained_by_npc_id).maybeSingle();
        const sNow = new Date();
        const sustainerDead = !sustainer || (sustainer.dead_until && new Date(sustainer.dead_until) > sNow);
        if (sustainerDead) {
          const long = "9999-12-31T00:00:00.000Z";
          await admin.from("npcs").update({ dead_until: long }).eq("id", target.id);
          await admin.from("messages").insert({
            room: profile.current_room, user_id: null, author_name: "—", kind: "system",
            content: `✶ ${target.name} shudders, then folds in on itself — its sustaining hand has been cut. The bones clatter to the floor and lie still.`,
          });
          throw new Error(`${target.name} collapses without its sustainer. The fight is already over.`);
        }
      }

      const stats = await playerStats(user.id);
      const playerMaxHp = (stats.prof?.max_hp ?? 20) + stats.hpBonus;
      const playerHp = Math.min(stats.prof?.hp ?? 20, playerMaxHp);

      const { data: combat } = await admin.from("combats").insert({
        room: profile.current_room, status: "active", turn_number: 1,
      }).select().single();

      const targetHp = target.kind === "player"
        ? target.hp
        : (target.is_boss && target.combat_max_hp ? target.combat_max_hp : 12 + SR(8));
      const targetMax = target.kind === "player" ? target.max_hp : targetHp;

      const playerInit = 10 + SR(10);
      const targetInit = 10 + SR(10);

      await admin.from("combatants").insert([
        { combat_id: combat!.id, side: "a", kind: "player", user_id: user.id, name: profile.username,
          hp: playerHp, max_hp: playerMaxHp, initiative: playerInit, turn_order: 0 },
        { combat_id: combat!.id, side: "b", kind: target.kind, user_id: target.kind === "player" ? target.id : null,
          npc_id: target.kind === "npc" ? target.id : null, name: target.kind === "player" ? target.username : target.name,
          hp: targetHp, max_hp: targetMax, initiative: targetInit, turn_order: 1 },
      ]);

      // Enroll the player's companion (if any) on side "a", then seat by initiative.
      const companion = await enrollCompanion(combat!.id, user.id, "a");
      const first = await seatInitiative(combat!.id);

      await admin.from("profiles").update({ in_combat_id: combat!.id }).eq("id", user.id);
      if (target.kind === "player") {
        await admin.from("profiles").update({ in_combat_id: combat!.id }).eq("id", target.id);
      }

      await pushAction(combat!.id, 1, user.id, profile.username, "system", target.kind === "player" ? target.username : target.name,
        `${profile.username} draws steel against ${target.kind === "player" ? target.username : target.name}!`);
      if (companion) {
        await pushAction(combat!.id, 1, null, companion.name, "system", null,
          `${companion.name} steps in beside ${profile.username}, weapon already in hand.`);
      }


      // Boss intro flourish — broadcast to the room when a boss fight begins.
      if (target.kind === "npc" && target.is_boss && target.boss_intro) {
        await admin.from("messages").insert({
          room: profile.current_room, user_id: null, author_name: "—", kind: "system",
          content: `✦ ${target.boss_intro}`,
        });
      }

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
      const joinComp = await enrollCompanion(combat.id, user.id, "a");
      await admin.from("profiles").update({ in_combat_id: combat.id }).eq("id", user.id);
      await pushAction(combat.id, combat.turn_number, user.id, profile.username, "system", null,
        `${profile.username} throws themselves into the fight, blade rising to join the fray.`);
      if (joinComp) {
        await pushAction(combat.id, combat.turn_number, null, joinComp.name, "system", null,
          `${joinComp.name} surges in at ${profile.username}'s shoulder.`);
      }

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

      // ✚ Sana — the Last Breath rune. Player MUST know both word and symbol.
      const LAST_BREATH_KEY = "sana";
      const { data: kn } = await admin.from("player_lesser_rune_knowledge")
        .select("knows_word, knows_symbol").eq("user_id", user.id).eq("rune_key", LAST_BREATH_KEY).maybeSingle();
      const knowsLastBreath = !!(kn?.knows_word && kn?.knows_symbol);

      let score = 0;
      if (knowsLastBreath && stroke.length >= 6) {
        const { data: rune } = await admin.from("lesser_runes").select("template").eq("key", LAST_BREATH_KEY).maybeSingle();
        const tpl = (rune?.template as Pt[] | undefined) ?? null;
        if (tpl && tpl.length >= 2) {
          score = Math.max(scoreStroke(stroke, tpl), scoreStroke(stroke, [...tpl].reverse()));
        }
      }
      const passed = knowsLastBreath && score >= 0.55;
      if (passed) {
        const reviveHp = Math.max(2, Math.floor((profile.max_hp ?? 20) * 0.15));

        // Last-minute escape: stagger to an adjacent room so they don't wake beside their killer.
        const { data: hereRoom } = await admin.from("rooms")
          .select("exits, name").eq("slug", profile.current_room).maybeSingle();
        const exitMap = (hereRoom?.exits ?? {}) as Record<string, string>;
        const exitEntries = Object.entries(exitMap).filter(([, to]) => !!to);
        let escapeRoom = profile.current_room as string;
        let escapeDir: string | null = null;
        let escapeName: string | null = null;
        if (exitEntries.length > 0) {
          // Prefer an exit that has no live aggro NPC waiting on the other side.
          const candidateSlugs = exitEntries.map(([, to]) => to);
          const { data: hostiles } = await admin.from("npcs")
            .select("room").in("room", candidateSlugs)
            .or("aggro_on_sight.eq.true,is_boss.eq.true")
            .is("dead_until", null);
          const hostileRooms = new Set((hostiles ?? []).map((n: any) => n.room));
          const safe = exitEntries.filter(([, to]) => !hostileRooms.has(to));
          const pool = safe.length > 0 ? safe : exitEntries;
          const [dir, to] = pool[Math.floor(Math.random() * pool.length)];
          escapeRoom = to; escapeDir = dir;
          const { data: dest } = await admin.from("rooms").select("name").eq("slug", to).maybeSingle();
          escapeName = (dest?.name as string) ?? to;
        }

        await admin.from("profiles").update({
          downed: false, downed_at: null, downed_combat_id: null,
          hp: reviveHp, in_combat_id: null,
          current_room: escapeRoom,
        }).eq("id", user.id);
        await admin.from("combatants").update({ defeated: true }).eq("id", me.id);

        await pushAction(combatId, combat.turn_number, user.id, me.name, "death_save", null,
          escapeDir
            ? `${me.name} traces ✚ Sana with a bloody hand (${Math.round(score * 100)}%) — the sigil flares and ${me.name} stumbles ${escapeDir} into ${escapeName}, gone before another blow can land.`
            : `${me.name} claws back from the brink (${Math.round(score * 100)}%) and reels out of the fight!`);

        if (escapeDir && escapeRoom !== profile.current_room) {
          await admin.from("messages").insert({
            room: escapeRoom, user_id: null, author_name: "—", kind: "system",
            content: `✚ ${me.name} collapses into the room, bloodied and gasping — the Last Breath rune still smoking on their skin.`,
          });
        }

        await advanceTurn(combatId);
        return ok({ ok: true, saved: true, hp: reviveHp, room: escapeRoom });
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
          knowsLastBreath
            ? `${me.name}'s hand fails the sigil (${Math.round(score * 100)}%). The breath leaves them. **${me.name} is dead.**`
            : `${me.name} has no rune of life to call upon — ✚ **Sana** was never learned. The breath leaves them. **${me.name} is dead.**`);
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
      let enemyArmor = 0;
      if (target.kind === "player") {
        enemyArmor = (await playerStats(target.user_id)).armor;
      } else if (target.npc_id) {
        const { data: nstat } = await admin.from("npcs").select("base_armor, dex").eq("id", target.npc_id).maybeSingle();
        const { data: worn } = await admin.from("npc_items")
          .select("items:item_key(base_armor)").eq("npc_id", target.npc_id).not("equipped_slot", "is", null);
        const wornArmor = (worn ?? []).reduce((s: number, w: any) => s + (w?.items?.base_armor ?? 0), 0);
        enemyArmor = (nstat?.base_armor ?? 0) + wornArmor;
      }
      const final = Math.max(1, raw - enemyArmor - (target.defending ? 2 : 0));
      const newHp = Math.max(0, target.hp - final);
      const defeated = newHp <= 0;
      await admin.from("combatants").update({ hp: newHp, defeated, defending: false }).eq("id", target.id);
      if (target.kind === "player") {
        await admin.from("profiles").update({ hp: newHp }).eq("id", target.user_id);
      }
      const targetArmorName = target.kind === "player" ? (await playerStats(target.user_id)).armorName : null;
      const fallback = `${me.name} strikes ${target.name} for ${final} damage.${defeated ? ` ${target.name} falls!` : ""}`;
      let targetTitle: string | null = null;
      if (target.kind === "npc" && target.npc_id) {
        const { data: trow } = await admin.from("npcs").select("title").eq("id", target.npc_id).maybeSingle();
        targetTitle = trow?.title ?? null;
      }
      const targetBeast = inferBeastForm(target.name, targetTitle);
      const ai = await narrateLine({
        actor: me.name, verb: "strikes", target: target.name,
        weapon: stats.weaponName ?? undefined,
        armor: targetBeast ? undefined : (targetArmorName ?? undefined),
        damage: final, defeated,
        targetBeast,
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
        const { data: npcRow } = await admin.from("npcs")
          .select("id,name,title,room,is_boss,boss_reward_gold,boss_reward_xp,boss_reward_merit")
          .eq("id", target.npc_id).maybeSingle();
        // === BOSS KILL: layer bonus rewards on top + broadcast world-wide fame. ===
        if (npcRow?.is_boss) {
          const bg = npcRow.boss_reward_gold ?? 0;
          const bx = npcRow.boss_reward_xp ?? 0;
          const bm = npcRow.boss_reward_merit ?? 0;
          await admin.from("profiles").update({
            xp: (profile.xp ?? 0) + reward + bx,
            gold: (profile.gold ?? 0) + goldReward + bg,
            merit: (profile.merit ?? 0) + meritReward + bm,
          }).eq("id", user.id);
          await admin.from("messages").insert({
            room: profile.current_room, user_id: null, author_name: "—", kind: "system",
            content: `✦✦✦ The hoard is yours. ${me.name} claims **${bg}g**, **${bx} xp**, and **${bm} merit** from the corpse of ${npcRow.name}.`,
          });
          // Broadcast fame to every other room — bards will sing this for years.
          const fameLine = `✦ Word storms across the Kingdoms: **${me.name}** has slain **${npcRow.name}, ${npcRow.title ?? "a dread power"}**. Bards already shape the song.`;
          const { data: allRooms } = await admin.from("rooms").select("slug");
          if (allRooms) {
            const rows = allRooms
              .filter((r: any) => r.slug !== profile.current_room)
              .map((r: any) => ({ room: r.slug, user_id: null, author_name: "—", kind: "system", content: fameLine }));
            // chunk to keep payload small
            for (let i = 0; i < rows.length; i += 200) {
              await admin.from("messages").insert(rows.slice(i, i + 200));
            }
          }
          // If the boss was a dragon (persona == 'dragon-boss'), also log a dragon_fell world event.
          await admin.from("world_events").insert({
            room: profile.current_room, kind: "dragon_stirs",
            actor_id: user.id, actor_name: me.name,
            target_kind: "npc", target_id: npcRow.id, target_name: npcRow.name,
            details: { fell: true, slain_by: me.name },
            decay_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
          });

          // ===== NECROMANTIC RETURN: a felled dragon-boss is scheduled to rise again =====
          const isDragon = /dragon|drake|wyrm/i.test(`${npcRow.name} ${npcRow.title ?? ""}`);
          if (isDragon) {
            // Avoid stacking: only one pending resurrection per original NPC.
            const { data: existingPR } = await admin.from("pending_resurrections")
              .select("id").eq("original_npc_id", npcRow.id).eq("status", "pending").maybeSingle();
            if (!existingPR) {
              const riseAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
              await admin.from("pending_resurrections").insert({
                original_npc_id: npcRow.id,
                original_name: npcRow.name,
                room: npcRow.room,
                resurrect_at: riseAt,
                new_name: `${npcRow.name}, Bone-Wreathed`,
                new_title: `risen drake stitched from ${npcRow.name}'s bones`,
                new_persona: `Once ${npcRow.name}, now a vast skeleton lashed together with grave-silk and burning sigils. Smoke leaks where its heart used to beat. A pale figure stands behind it, lips moving.`,
                new_max_hp: Math.round((npcRow.combat_max_hp ?? 240) * 1.6),
                new_damage_min: 16,
                new_damage_max: 34,
                new_boss_intro: `Bone hinges grind. ${npcRow.name}'s ribcage rises like a cathedral. Behind it, a thin man in patched grey opens his mouth — and the dragon's jaw opens with him.`,
              });
            }
          }
        }
        if (npcRow) {
          // PERMA-DEATH: the NPC is gone for good. Tension still decays for gossip purposes.
          const deadUntil = "9999-12-31T00:00:00.000Z";
          const decayAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
          await admin.from("npcs").update({ dead_until: deadUntil }).eq("id", npcRow.id);

          // === Spill inventory + purse into room loot ===
          const { data: corpsePurse } = await admin.from("npcs").select("purse_gold").eq("id", npcRow.id).maybeSingle();
          if (corpsePurse?.purse_gold && corpsePurse.purse_gold > 0) {
            await admin.from("room_loot").insert({
              room: profile.current_room, gold: corpsePurse.purse_gold,
              source: "corpse", placed_by_name: npcRow.name,
            });
            await admin.from("npcs").update({ purse_gold: 0 }).eq("id", npcRow.id);
          }
          const { data: carried } = await admin.from("npc_items").select("id,item_key,quantity").eq("npc_id", npcRow.id);
          if (carried && carried.length) {
            const dropRows = carried.map((c: any) => ({
              room: profile.current_room, gold: 0, item_key: c.item_key, quantity: c.quantity,
              source: "corpse", placed_by_name: npcRow.name,
            }));
            await admin.from("room_loot").insert(dropRows);
            await admin.from("npc_items").delete().eq("npc_id", npcRow.id);
            await admin.from("messages").insert({
              room: profile.current_room, user_id: null, author_name: "—", kind: "system",
              content: `✶ ${npcRow.name}'s gear and pouches spill across the ground.`,
            });
          }
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
