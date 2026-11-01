import { describe, it, expect } from "vitest";
import {
  abilityMod, levelBonus, rollDie, check, dcForChance, startingScores, abilityScores,
  checkModifier, formatCheck, outcomeOf,
} from "../../supabase/functions/_shared/dice";

// rng that returns the value that makes rollDie(sides) land on `face`.
const face = (n: number, sides: number) => () => (n - 1) / sides;

// Fraction of all faces of a `die` that pass `dc` with `modifier`: the exact success probability.
const exactChance = (dc: number, modifier: number, die = 20) => {
  let ok = 0;
  for (let f = 1; f <= die; f++) if (check({ dc, modifier, die, rng: face(f, die) }).success) ok++;
  return ok / die;
};

describe("rollDie", () => {
  it("covers 1..sides and never leaves it", () => {
    expect(rollDie(20, () => 0)).toBe(1);
    expect(rollDie(20, () => 0.999999)).toBe(20);
    expect(rollDie(12, face(7, 12))).toBe(7);
  });
});

describe("modifiers", () => {
  it("10 is the neutral score; every 2 points is ±1", () => {
    expect(abilityMod(10)).toBe(0);
    expect(abilityMod(11)).toBe(0);
    expect(abilityMod(12)).toBe(1);
    expect(abilityMod(9)).toBe(-1);
    expect(abilityMod(15)).toBe(2);
  });
  it("level bonus is 0 for brand-new characters so level 1 keeps baseline odds", () => {
    expect(levelBonus(1)).toBe(0);
    expect(levelBonus(4)).toBe(0);
    expect(levelBonus(5)).toBe(1);
    expect(levelBonus(9)).toBe(2);
  });
  it("missing ability columns read as 10, so old profiles behave as neutral", () => {
    expect(abilityScores(null).dex).toBe(10);
    expect(abilityScores({ dex: 14 }).dex).toBe(14);
  });
  it("starting scores add race and class mods to 10", () => {
    const s = startingScores({ dex: 2, con: -1 }, { dex: 2, int: 1 });
    expect(s).toEqual({ str: 10, dex: 14, con: 9, int: 11, wis: 10, cha: 10 });
  });
  it("checkModifier stacks ability, level and situational bonus", () => {
    expect(checkModifier(startingScores({ wis: 4 }, {}), "wis", 5, 1)).toBe(2 + 1 + 1);
  });
});

describe("check", () => {
  it("success is total >= dc — no auto-pass on natural max, so impossible DCs stay impossible", () => {
    const r = check({ dc: 22, die: 20, rng: face(20, 20) });
    expect(r.crit).toBe(true);
    expect(r.success).toBe(false);
  });
  it("natural 1 can still pass an easy DC — no auto-fail", () => {
    const r = check({ dc: 1, rng: face(1, 20) });
    expect(r.fumble).toBe(true);
    expect(r.success).toBe(true);
  });
  it("modifiers shift the odds by 5% per point on a d20", () => {
    expect(exactChance(11, 0)).toBe(0.5);
    expect(exactChance(11, 2)).toBe(0.6);
    expect(exactChance(11, -2)).toBe(0.4);
  });
  it("formats rolls for chat", () => {
    expect(formatCheck(check({ dc: 12, modifier: 2, rng: face(14, 20) }))).toBe("14+2=16 vs 12");
    expect(formatCheck(check({ dc: 12, modifier: -1, rng: face(14, 20) }))).toBe("14-1=13 vs 12");
    expect(formatCheck(check({ dc: 12, rng: face(14, 20) }))).toBe("14 vs 12");
  });
  it("labels outcomes", () => {
    expect(outcomeOf(check({ dc: 12, rng: face(20, 20) }))).toBe("critical success");
    expect(outcomeOf(check({ dc: 12, rng: face(1, 20) }))).toBe("critical failure");
  });
});

describe("dcForChance keeps the old Math.random odds for a neutral character", () => {
  // These are the exact probabilities the converted checks used before dice.
  it("camp ambush 35% → not ambushed 65% on a d20", () => {
    expect(exactChance(dcForChance(0.65), 0)).toBeCloseTo(0.65, 5);
  });
  it("gathering's 50% second pull", () => {
    expect(exactChance(dcForChance(0.5), 0)).toBe(0.5);
  });
  it("crafting crit chance = lifeskill level % on a d100", () => {
    for (const lvl of [1, 7, 33, 50]) expect(exactChance(dcForChance(lvl / 100, 100), 0, 100)).toBeCloseTo(lvl / 100, 5);
  });
  it("desert getting-lost odds are within one d20 step (5%) of the old chance", () => {
    for (let depth = 1; depth <= 7; depth++) {
      const lost = Math.min(0.85, 0.15 + depth * 0.12);
      expect(Math.abs(exactChance(dcForChance(1 - lost), 0) - (1 - lost))).toBeLessThanOrEqual(0.025 + 1e-9);
    }
  });
});
