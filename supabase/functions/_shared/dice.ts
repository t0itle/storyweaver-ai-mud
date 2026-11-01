// Dice + ability-modifier checks. Shared by edge functions and tests so the math lives in one place.
//
// Design rule: a level-1 character with every ability at 10 (modifier +0) gets the SAME odds the
// old Math.random() checks gave. Better scores and higher levels shift the odds; the baseline doesn't move.

export type Ability = "str" | "dex" | "con" | "int" | "wis" | "cha";
export const ABILITIES: Ability[] = ["str", "dex", "con", "int", "wis", "cha"];
export type AbilityScores = Record<Ability, number>;
export type Rng = () => number; // returns [0, 1), like Math.random

export const BASE_ABILITY_SCORE = 10;

/** Roll one die with `sides` faces: 1..sides. */
export function rollDie(sides: number, rng: Rng = Math.random): number {
  return 1 + Math.floor(rng() * sides);
}

/** Classic modifier: 10-11 → +0, 12-13 → +1, 8-9 → -1. */
export function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

/** Character-level bonus: +0 at levels 1-4, +1 at 5-8, +2 at 9-12, ... */
export function levelBonus(level: number): number {
  return Math.max(0, Math.floor((level - 1) / 4));
}

/** Read the six scores off a profile row, defaulting missing ones to 10. */
export function abilityScores(row: Partial<Record<Ability, number | null>> | null | undefined): AbilityScores {
  const out = {} as AbilityScores;
  for (const a of ABILITIES) out[a] = row?.[a] ?? BASE_ABILITY_SCORE;
  return out;
}

/** Starting scores: 10 + race mods + class mods (mods are jsonb like {"str":2,"cha":-1}). */
export function startingScores(
  raceMods: Partial<Record<Ability, number>> | null | undefined,
  classMods: Partial<Record<Ability, number>> | null | undefined,
): AbilityScores {
  const out = {} as AbilityScores;
  for (const a of ABILITIES) out[a] = BASE_ABILITY_SCORE + (raceMods?.[a] ?? 0) + (classMods?.[a] ?? 0);
  return out;
}

/**
 * DC on a `die` such that an unmodified roll succeeds with probability `p`.
 * P(roll >= dc) = (die - dc + 1) / die  →  dc = die + 1 - p * die. Rounded to the nearest whole DC.
 */
export function dcForChance(p: number, die = 20): number {
  return Math.round(die + 1 - p * die);
}

export interface CheckResult {
  die: number;       // die size rolled
  roll: number;      // natural roll
  modifier: number;  // total modifier added
  total: number;     // roll + modifier
  dc: number;
  success: boolean;  // total >= dc. No auto-success/fail, so odds stay exactly as computed.
  crit: boolean;     // natural max (narration flavour only)
  fumble: boolean;   // natural 1 (narration flavour only)
}

export function check(opts: { dc: number; modifier?: number; die?: number; rng?: Rng }): CheckResult {
  const die = opts.die ?? 20;
  const modifier = opts.modifier ?? 0;
  const roll = rollDie(die, opts.rng);
  const total = roll + modifier;
  return { die, roll, modifier, total, dc: opts.dc, success: total >= opts.dc, crit: roll === die, fumble: roll === 1 };
}

/** Standard character check modifier: ability modifier + level bonus + any situational extra. */
export function checkModifier(scores: AbilityScores, ability: Ability, level = 1, extra = 0): number {
  return abilityMod(scores[ability]) + levelBonus(level) + extra;
}

/** Short text for chat lines: "14+2=16 vs 12". */
export function formatCheck(r: CheckResult): string {
  const sign = r.modifier >= 0 ? "+" : "-";
  return r.modifier === 0 ? `${r.roll} vs ${r.dc}` : `${r.roll}${sign}${Math.abs(r.modifier)}=${r.total} vs ${r.dc}`;
}

/** Which ability drives each life skill (gather-node, craft-item). */
export const LIFESKILL_ABILITY: Record<string, Ability> = {
  foraging: "wis",
  mining: "str",
  fishing: "dex",
  cooking: "wis",
  alchemy: "int",
  smithing: "str",
};

/**
 * Free-form `interact` verbs that take effort and get a check. Verbs not listed (look, smell, sit, read…)
 * just happen with no roll.
 */
export const INTERACT_VERB_ABILITY: Record<string, Ability> = {
  push: "str", pull: "str", break: "str", smash: "str", tear: "str", lift: "str", carry: "str",
  throw: "str", dig: "str", climb: "str",
  pick: "dex", cut: "dex", twist: "dex", dance: "dex",
  search: "wis", listen: "wis", pray: "wis", meditate: "wis",
  write: "int",
  sing: "cha", whistle: "cha",
};
/** Default DC for open-ended checks (interact verbs, social rolls in npc-respond). */
export const DEFAULT_DC = 12;

export type Outcome = "critical success" | "success" | "failure" | "critical failure";
export function outcomeOf(r: CheckResult): Outcome {
  if (r.success) return r.crit ? "critical success" : "success";
  return r.fumble ? "critical failure" : "failure";
}
