// The NPC "code brain": needs, personality, utility-scored actions and wants.
// Pure, dependency-free TypeScript shared by edge functions (npc-agent-tick, npc-respond) and tests.
// No AI here: this runs for every agent NPC on every world tick for free.
// See docs/npc-agents.md §3 and §6.

export type Need = "coin" | "hunger" | "rest" | "safety" | "belonging" | "faith";
export const NEEDS: Need[] = ["coin", "hunger", "rest", "safety", "belonging", "faith"];
/** 100 = fully satisfied, 0 = desperate. */
export type Needs = Record<Need, number>;

export type Trait = "diligence" | "sociability" | "piety" | "greed" | "caution";
export const TRAITS: Trait[] = ["diligence", "sociability", "piety", "greed", "caution"];
/** 0..1 each. Derived once from the NPC id, then stored in npc_souls.core.traits. */
export type Traits = Record<Trait, number>;

export type Bucket = "dawn" | "morning" | "midday" | "dusk" | "night";

/** In-game time slot (UTC hours), matching world-tick's timeBucket. */
export function bucketAt(d: Date): Bucket {
  const h = d.getUTCHours();
  if (h < 6) return "night";
  if (h < 9) return "dawn";
  if (h < 13) return "morning";
  if (h < 17) return "midday";
  if (h < 21) return "dusk";
  return "night";
}
export type Action = "work" | "eat" | "sleep" | "socialize" | "pray" | "keep_watch";
export const ACTIONS: Action[] = ["work", "eat", "sleep", "socialize", "pray", "keep_watch"];

export const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

// ---------- personality ----------

function fnv1a(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Stable traits from an NPC id: the same NPC always gets the same personality. */
export function traitsFor(npcId: string): Traits {
  const out = {} as Traits;
  for (const t of TRAITS) out[t] = (fnv1a(`${npcId}:${t}`) % 1000) / 999;
  return out;
}

// ---------- needs ----------

export const DEFAULT_NEEDS: Needs = { coin: 70, hunger: 80, rest: 80, safety: 80, belonging: 70, faith: 70 };

/** Per-hour drift when the need is not being served. */
export const NEED_DECAY_PER_HOUR: Needs = { coin: 0, hunger: 6, rest: 4, safety: 0, belonging: 2, faith: 1 };

/** Gold an NPC considers "comfortable"; coin need is purse relative to this. */
export const COIN_COMFORT = 60;

export function coinNeedFromPurse(purse: number | null | undefined): number {
  return clamp(Math.round(((purse ?? 0) / COIN_COMFORT) * 100));
}

/** Apply `hours` of decay. Coin is not decayed here; it follows the purse. */
export function decayNeeds(needs: Needs, hours: number): Needs {
  const out = { ...needs };
  for (const n of NEEDS) out[n] = clamp(out[n] - NEED_DECAY_PER_HOUR[n] * hours);
  return out;
}

/** 0 when satisfied, 1 when desperate. Squared so low needs dominate. */
export function urgency(value: number): number {
  const u = (100 - clamp(value)) / 100;
  return u * u;
}

export function lowestNeed(needs: Needs): Need {
  return NEEDS.reduce((a, b) => (needs[b] < needs[a] ? b : a));
}

// ---------- actions ----------

/** What each action restores, and what it costs. Applied once per tick hour. */
export const ACTION_EFFECTS: Record<Action, { restore: Partial<Needs>; cost: Partial<Needs>; gold: number }> = {
  work:       { restore: {},                 cost: { rest: 3 },  gold: 4 },   // wage per hour
  eat:        { restore: { hunger: 60 },     cost: {},           gold: -2 },  // a meal
  sleep:      { restore: { rest: 35 },       cost: {},           gold: 0 },
  socialize:  { restore: { belonging: 30 },  cost: {},           gold: -1 },  // a round
  pray:       { restore: { faith: 40 },      cost: {},           gold: 0 },
  keep_watch: { restore: { safety: 25 },     cost: { rest: 2 },  gold: 0 },
};

/** The need an action mainly serves (coin for work). */
const ACTION_NEED: Record<Action, Need> = {
  work: "coin", eat: "hunger", sleep: "rest", socialize: "belonging", pray: "faith", keep_watch: "safety",
};

/** Routine pull: what a typical day looks like, so needs bend the day rather than replace it. */
const ROUTINE: Record<Bucket, Partial<Record<Action, number>>> = {
  dawn:    { pray: 0.25, eat: 0.2, work: 0.1 },
  morning: { work: 0.45 },
  midday:  { work: 0.35, eat: 0.3 },
  dusk:    { socialize: 0.35, eat: 0.25 },
  night:   { sleep: 0.6 },
};

const TRAIT_FOR_ACTION: Partial<Record<Action, Trait>> = {
  work: "diligence", socialize: "sociability", pray: "piety", keep_watch: "caution",
};

export interface ActionContext {
  needs: Needs;
  traits: Traits;
  bucket: Bucket;
  /** Guards, wardens and fences treat keeping watch as their work. */
  isGuard?: boolean;
  /** Purse gold; an NPC that can't pay doesn't choose paid actions. */
  purse?: number;
}

/** Utility score for one action. Higher wins. Pure and deterministic. */
export function scoreAction(a: Action, ctx: ActionContext): number {
  const gold = ACTION_EFFECTS[a].gold;
  if (gold < 0 && (ctx.purse ?? 0) < -gold) return -1; // can't afford it
  const need = ACTION_NEED[a];
  let s = urgency(ctx.needs[need]);
  if (a === "work") s += 0.15 * ctx.traits.greed;            // greedy NPCs work even when comfortable
  s += ROUTINE[ctx.bucket][a] ?? 0;
  if (a === "keep_watch" && ctx.isGuard) s += ROUTINE[ctx.bucket].work ?? 0; // guards' work is the watch
  const t = TRAIT_FOR_ACTION[a];
  if (t) s *= 0.2 + 1.6 * ctx.traits[t];   // personality scales need AND routine (0.2×–1.8×; 1× at average)
  if (a === "sleep" && ctx.bucket !== "night" && ctx.needs.rest > 25) s -= 0.5; // no naps unless exhausted
  return s;
}

export function chooseAction(ctx: ActionContext): Action {
  let best: Action = "work";
  let bestScore = -Infinity;
  for (const a of ACTIONS) {
    const s = scoreAction(a, ctx);
    if (s > bestScore) { best = a; bestScore = s; }
  }
  return best;
}

/** Wages stop once a purse reaches this, so working NPCs don't hoard without limit. */
export const WAGE_PURSE_CAP = 200;

/** Apply one hour of an action. Returns new needs and the purse change. */
export function applyAction(a: Action, needs: Needs, purse = 0): { needs: Needs; goldDelta: number } {
  const eff = ACTION_EFFECTS[a];
  const out = { ...needs };
  for (const [n, v] of Object.entries(eff.restore) as [Need, number][]) out[n] = clamp(out[n] + v);
  for (const [n, v] of Object.entries(eff.cost) as [Need, number][]) out[n] = clamp(out[n] - v);
  const goldDelta = eff.gold > 0 && purse >= WAGE_PURSE_CAP ? 0 : eff.gold;
  return { needs: out, goldDelta };
}

// ---------- mood ----------

export function moodFor(needs: Needs): { mood: string; intensity: number } {
  const low = lowestNeed(needs);
  const v = needs[low];
  if (v >= 60) return { mood: "content", intensity: 1 };
  const MOOD: Record<Need, string> = {
    coin: "anxious about money", hunger: "hungry and short-tempered", rest: "bone-tired",
    safety: "frightened", belonging: "lonely", faith: "spiritually adrift",
  };
  return { mood: MOOD[low], intensity: v < 25 ? 3 : 2 };
}

// ---------- wants ----------

/** A need below this becomes a want: something the NPC will ask others for. */
export const WANT_THRESHOLD = 25;

export interface Want {
  need: Need;
  /** Short first-person line the NPC can say or post. */
  text: string;
  since: string;   // ISO time the want arose
}

const WANT_TEXT: Record<Need, string> = {
  coin: "I need coin — any honest work, or a debt repaid.",
  hunger: "I haven't eaten properly in days.",
  rest: "I can't sleep. Something has to give.",
  safety: "I don't feel safe here anymore.",
  belonging: "I've no one to talk to. I'd give a lot for word from my kin.",
  faith: "I've lost my way with the gods. I need a sign.",
};

/** Wants the NPC should hold now, keeping the `since` of wants it already had. */
export function deriveWants(needs: Needs, existing: Want[], nowIso: string): Want[] {
  const out: Want[] = [];
  for (const n of NEEDS) {
    if (needs[n] >= WANT_THRESHOLD) continue;
    const prev = existing.find((w) => w.need === n);
    out.push(prev ?? { need: n, text: WANT_TEXT[n], since: nowIso });
  }
  return out;
}

/** Wants that can be turned into a quest for players (a visit-the-room favour). Coin is excluded:
 *  an NPC short of coin can't fund a reward, so it works instead. */
export const QUESTABLE_NEEDS: Need[] = ["hunger", "safety", "belonging", "faith"];

export interface QuestDraft { title: string; objective: string; description: string }

/** What a hungry NPC asks for: a real catalog item, so handing it over is checked by code
 *  (_shared/questRules.ts) instead of completing the moment a player walks into the room. */
export const WANT_FOOD_ITEM = "flat-bread";

/** A want quest's target. Hunger wants an item; the others send the player to a room. */
export function wantTarget(need: Need, room: string): { kind: "item" | "room"; ref: string } {
  return need === "hunger" ? { kind: "item", ref: WANT_FOOD_ITEM } : { kind: "room", ref: room };
}

/** Turn a want into a favour quest. `targetName` is the room the player must reach. */
export function questForWant(npcName: string, need: Need, targetName: string): QuestDraft | null {
  switch (need) {
    case "hunger": return {
      title: `Bread for ${npcName}`,
      objective: `Bring ${npcName} a round of flat bread.`,
      description: `${npcName} has gone too long without a proper meal and asks for help.`,
    };
    case "safety": return {
      title: `Walk the way to ${targetName}`,
      objective: `Walk to ${targetName} and see that the way is safe.`,
      description: `${npcName} is afraid of what lurks on the road and wants someone to look.`,
    };
    case "belonging": return {
      title: `Word from ${npcName}`,
      objective: `Carry ${npcName}'s message to ${targetName}.`,
      description: `${npcName} has been alone too long and wants word carried to someone they love.`,
    };
    case "faith": return {
      title: `A candle for ${npcName}`,
      objective: `Light a candle on ${npcName}'s behalf at ${targetName}.`,
      description: `${npcName}'s faith is shaken. They ask for a candle lit where the gods might see.`,
    };
    default: return null;
  }
}

/** Reward an NPC offers: up to 30% of its purse, between 5 and 20 gold (20 = the 'minor' quest
 *  severity cap in quest_reward_caps, so the player receives what the NPC paid). Null if under 5. */
export const NPC_REWARD_MAX = 20;
export function rewardFor(purse: number): number | null {
  const r = Math.min(NPC_REWARD_MAX, Math.floor(purse * 0.3));
  return r >= 5 ? r : null;
}

// ---------- disclosure (what a player has earned the right to hear) ----------

/** 0 public, 1 acquaintance, 2 trusted, 3 confidant. */
export type Disclosure = 0 | 1 | 2 | 3;
export const DISCLOSURE_AMITY: Record<Disclosure, number> = { 0: -100, 1: 20, 2: 50, 3: 80 };

export function disclosureFor(amity: number): Disclosure {
  if (amity >= DISCLOSURE_AMITY[3]) return 3;
  if (amity >= DISCLOSURE_AMITY[2]) return 2;
  if (amity >= DISCLOSURE_AMITY[1]) return 1;
  return 0;
}

/** Amity at which an NPC trusts a player enough to write to them directly. */
export const LETTER_AMITY = DISCLOSURE_AMITY[2];

// ---------- barks (ambient lines, no AI) ----------

const BARKS: Record<Action, string[]> = {
  work:       ["{n} works steadily, eyes on the task.", "{n} counts the day's takings under their breath."],
  eat:        ["{n} eats quickly, elbows on the table.", "{n} tears into a heel of bread."],
  sleep:      ["{n} dozes, chin on chest."],
  socialize:  ["{n} trades gossip with anyone who'll listen.", "{n} laughs a little too loudly at someone's joke."],
  pray:       ["{n} murmurs a prayer, fingers worrying a charm.", "{n} bows their head toward the throne-ward sky."],
  keep_watch: ["{n} watches the road, one hand near their belt.", "{n} scans every face that passes."],
};
const NEED_BARKS: Record<Need, string> = {
  coin: "{n} turns out an empty purse and sighs.",
  hunger: "{n}'s stomach growls loud enough to hear.",
  rest: "{n} rubs red-rimmed eyes.",
  safety: "{n} glances over their shoulder, again.",
  belonging: "{n} sits apart, watching the others talk.",
  faith: "{n} stares at nothing, lips moving without sound.",
};

/** A short ambient line. `seed` picks among variants deterministically (e.g. hour of day). */
export function barkFor(name: string, action: Action, needs: Needs, seed: number): string {
  const low = lowestNeed(needs);
  const line = needs[low] < WANT_THRESHOLD
    ? NEED_BARKS[low]
    : BARKS[action][Math.abs(seed) % BARKS[action].length];
  return `*${line.replace("{n}", name)}*`;
}

// ---------- asking for help ----------

/** A want must last this long before the NPC asks anyone for help (no asking over a skipped meal). */
export const ASK_AFTER_HOURS = 6;
/** An unanswered request (board post or letter) lapses after this, and the NPC may ask again. */
export const ASK_AGAIN_AFTER_DAYS = 3;

export interface RoomLite { slug: string; kind: string; town_key: string | null }

/** Where a player must go to fulfil a want. Deterministic per NPC so re-asks point to the same place. */
export function targetRoomFor(need: Need, npc: { id: string; room: string }, homeTown: string | null, rooms: RoomLite[]): string | null {
  const pick = (cands: RoomLite[]) => {
    if (!cands.length) return null;
    const sorted = [...cands].sort((a, b) => a.slug.localeCompare(b.slug));
    return sorted[fnv1a(`${npc.id}:${need}`) % sorted.length].slug;
  };
  switch (need) {
    case "hunger": return npc.room;   // bring the meal to them
    case "safety": return pick(rooms.filter((r) => (r.kind === "road" || r.kind === "gate") && r.town_key === homeTown))
      ?? pick(rooms.filter((r) => r.kind === "road"));
    case "belonging": return pick(rooms.filter((r) =>
      ["square", "tavern", "market"].includes(r.kind) && r.town_key && r.town_key !== homeTown));
    case "faith": return pick(rooms.filter((r) => r.kind === "throne"));
    default: return null;
  }
}
