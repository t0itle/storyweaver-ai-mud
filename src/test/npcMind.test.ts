import { describe, it, expect } from "vitest";
import {
  traitsFor, decayNeeds, DEFAULT_NEEDS, chooseAction, applyAction, deriveWants, questForWant,
  rewardFor, disclosureFor, moodFor, coinNeedFromPurse, barkFor, WAGE_PURSE_CAP, type Needs, type Traits,
} from "../../supabase/functions/_shared/npcMind";

const avg: Traits = { diligence: 0.5, sociability: 0.5, piety: 0.5, greed: 0.5, caution: 0.5 };
const fine: Needs = { coin: 90, hunger: 90, rest: 90, safety: 90, belonging: 90, faith: 90 };

describe("personality", () => {
  it("is stable per NPC (same id → same traits) so a character doesn't change between ticks", () => {
    expect(traitsFor("npc-1")).toEqual(traitsFor("npc-1"));
  });
  it("differs between NPCs", () => {
    expect(traitsFor("npc-1")).not.toEqual(traitsFor("npc-2"));
  });
  it("stays in 0..1", () => {
    for (const v of Object.values(traitsFor("x"))) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
  });
});

describe("needs drive the day", () => {
  it("a satisfied NPC follows routine: works in the morning, sleeps at night", () => {
    expect(chooseAction({ needs: fine, traits: avg, bucket: "morning", purse: 50 })).toBe("work");
    expect(chooseAction({ needs: fine, traits: avg, bucket: "night", purse: 50 })).toBe("sleep");
  });
  it("a starving NPC eats even in the working morning", () => {
    expect(chooseAction({ needs: { ...fine, hunger: 5 }, traits: avg, bucket: "morning", purse: 50 })).toBe("eat");
  });
  it("a broke NPC can't buy a meal, so it works for coin instead", () => {
    const a = chooseAction({ needs: { ...fine, hunger: 5, coin: 0 }, traits: avg, bucket: "morning", purse: 0 });
    expect(a).not.toBe("eat");
  });
  it("guards keep watch as their work", () => {
    expect(chooseAction({ needs: { ...fine, safety: 60 }, traits: avg, bucket: "morning", isGuard: true, purse: 50 })).toBe("keep_watch");
  });
  it("personality matters: a pious NPC prays at dawn where an impious one doesn't", () => {
    const pious = { ...avg, piety: 1 }, godless = { ...avg, piety: 0, diligence: 1 };
    const needs = { ...fine, faith: 50 };
    expect(chooseAction({ needs, traits: pious, bucket: "dawn", purse: 50 })).toBe("pray");
    expect(chooseAction({ needs, traits: godless, bucket: "dawn", purse: 50 })).not.toBe("pray");
  });
  it("needs decay over time and never go below 0", () => {
    const d = decayNeeds(DEFAULT_NEEDS, 100);
    expect(d.hunger).toBe(0);
    expect(d.coin).toBe(DEFAULT_NEEDS.coin); // coin follows the purse, not time
  });
  it("actions restore their need and cost gold", () => {
    const r = applyAction("eat", { ...fine, hunger: 10 }, 50);
    expect(r.needs.hunger).toBe(70);
    expect(r.goldDelta).toBe(-2);
  });
  it("wages stop at the purse cap so NPCs don't hoard forever", () => {
    expect(applyAction("work", fine, WAGE_PURSE_CAP).goldDelta).toBe(0);
    expect(applyAction("work", fine, 10).goldDelta).toBeGreaterThan(0);
  });
  it("coin need tracks the purse", () => {
    expect(coinNeedFromPurse(0)).toBe(0);
    expect(coinNeedFromPurse(1000)).toBe(100);
  });
});

describe("wants", () => {
  it("only desperate needs become wants", () => {
    const w = deriveWants({ ...fine, belonging: 10 }, [], "t0");
    expect(w.map((x) => x.need)).toEqual(["belonging"]);
  });
  it("keep their original start time while they persist (so 'how long' is measurable)", () => {
    const first = deriveWants({ ...fine, belonging: 10 }, [], "t0");
    expect(deriveWants({ ...fine, belonging: 5 }, first, "t1")[0].since).toBe("t0");
  });
  it("disappear when the need is met", () => {
    const first = deriveWants({ ...fine, belonging: 10 }, [], "t0");
    expect(deriveWants(fine, first, "t1")).toEqual([]);
  });
  it("become a visit quest naming the target room; coin wants never become quests", () => {
    expect(questForWant("Maren", "belonging", "the Glass Mile")?.objective).toContain("the Glass Mile");
    expect(questForWant("Maren", "coin", "x")).toBeNull();
  });
  it("rewards come from the NPC's own purse, and a poor NPC can't post one", () => {
    expect(rewardFor(100)).toBe(25);
    expect(rewardFor(40)).toBe(12);
    expect(rewardFor(10)).toBeNull();
  });
});

describe("disclosure: players earn an NPC's inner life through amity", () => {
  it("maps amity to levels 0..3", () => {
    expect(disclosureFor(-50)).toBe(0);
    expect(disclosureFor(19)).toBe(0);
    expect(disclosureFor(20)).toBe(1);
    expect(disclosureFor(50)).toBe(2);
    expect(disclosureFor(80)).toBe(3);
  });
});

describe("presentation", () => {
  it("mood comes from the lowest need", () => {
    expect(moodFor(fine).mood).toBe("content");
    expect(moodFor({ ...fine, safety: 10 })).toEqual({ mood: "frightened", intensity: 3 });
  });
  it("barks name the NPC and show a desperate need over routine", () => {
    expect(barkFor("Maren", "work", fine, 0)).toContain("Maren");
    expect(barkFor("Maren", "work", { ...fine, hunger: 5 }, 0)).toContain("stomach");
  });
});
