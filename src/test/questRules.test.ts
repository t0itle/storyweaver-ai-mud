import { describe, it, expect } from "vitest";
import {
  completionMode, aiMayTriggerCompletion, arrivalCompletes, type QuestLite, type TargetExists,
  severityCeiling, clampSeverity, escrowFor, refundAfterPayout, severityForGold, checkOfferTarget,
  questTargetKindFromBoard, type RewardCaps, type Severity,
} from "../../supabase/functions/_shared/questRules";
import { wantTarget, questForWant, WANT_FOOD_ITEM } from "../../supabase/functions/_shared/npcMind";

const real: TargetExists = { item: true, room: true, npc: true };
const fake: TargetExists = { item: false, room: false, npc: false };
const q = (kind: string, target_kind: string | null, target_ref: string | null): QuestLite => ({ kind, target_kind, target_ref });

describe("a quest with a real target is decided by the world, not by what the player says", () => {
  it("a fetch quest for a real item needs the item, so 'I brought it' alone can't finish it", () => {
    expect(completionMode(q("fetch", "item", "pitted-longsword"), real)).toBe("item");
  });
  it("a room quest completes only on arrival; the NPC can't be talked into completing it", () => {
    const mode = completionMode(q("visit", "room", "ash-road"), real);
    expect(mode).toBe("room");
    expect(aiMayTriggerCompletion(mode)).toBe(false);
  });
  it("guild quests use target_kind 'visit' for a room and are treated the same", () => {
    expect(completionMode(q("favor", "visit", "first-city-mages-hall"), real)).toBe("room");
  });
  it("a slay quest on a real NPC completes only from a recorded kill", () => {
    const mode = completionMode(q("slay", "npc", "Orrin"), real);
    expect(mode).toBe("kill");
    expect(aiMayTriggerCompletion(mode)).toBe(false);
  });
  it("riddles are settled by riddle-solve, never by the NPC", () => {
    expect(aiMayTriggerCompletion(completionMode(q("riddle", null, null), real))).toBe(false);
  });
});

describe("quests without a real target stay with the NPC's judgment (owner's decision, until Phase 2)", () => {
  it("a made-up item falls back to judgment so the quest stays finishable", () => {
    const mode = completionMode(q("fetch", "item", "silver-locket"), fake);
    expect(mode).toBe("judgment");
    expect(aiMayTriggerCompletion(mode)).toBe(true);
  });
  it("talk and favor quests with no target are judged", () => {
    expect(completionMode(q("talk", null, null), real)).toBe("judgment");
  });
  it("a 'deliver to an NPC' quest is not mistaken for a kill", () => {
    expect(completionMode(q("deliver", "npc", "Orrin"), real)).toBe("judgment");
  });
});

describe("arrival only counts for the room the server says the player is in", () => {
  it("completes a room quest in its target room", () => {
    expect(arrivalCompletes(q("escort", "room", "Ash-Road"), "ash-road")).toBe(true);
  });
  it("does not complete it anywhere else", () => {
    expect(arrivalCompletes(q("visit", "room", "ash-road"), "first-city")).toBe(false);
  });
  it("never completes item, kill or riddle quests on arrival", () => {
    expect(arrivalCompletes(q("fetch", "item", "ash-road"), "ash-road")).toBe(false);
    expect(arrivalCompletes(q("slay", "npc", "ash-road"), "ash-road")).toBe(false);
    expect(arrivalCompletes(q("riddle", "room", "ash-road"), "ash-road")).toBe(false);
  });
});

// Mirrors quest_reward_caps in SQL (the source of truth) only so these tests have numbers to use.
const CAPS: Record<Severity, RewardCaps> = {
  trivial: { gold_max: 5, xp_max: 15, amity_max: 3 }, minor: { gold_max: 20, xp_max: 40, amity_max: 6 },
  standard: { gold_max: 60, xp_max: 100, amity_max: 10 }, major: { gold_max: 200, xp_max: 250, amity_max: 20 },
  legendary: { gold_max: 600, xp_max: 600, amity_max: 40 },
};

describe("an NPC can't be talked into offering more than its station allows", () => {
  it("an ordinary resident can offer at most a minor quest, however the AI labels it", () => {
    expect(clampSeverity("legendary", severityCeiling({}))).toBe("minor");
  });
  it("merchants and guards can go to standard, wardens and bosses to major, only Aethers to legendary", () => {
    expect(severityCeiling({ is_merchant: true })).toBe("standard");
    expect(severityCeiling({ is_guard: true })).toBe("standard");
    expect(severityCeiling({ is_warden: true })).toBe("major");
    expect(severityCeiling({ is_boss: true })).toBe("major");
    expect(severityCeiling({ is_aether: true })).toBe("legendary");
  });
  it("a smaller severity than the ceiling is kept", () => {
    expect(clampSeverity("trivial", "major")).toBe("trivial");
  });
  it("an unknown severity counts as minor rather than slipping past the clamp", () => {
    expect(clampSeverity("epic", "legendary")).toBe("minor");
  });
});

describe("NPC quest gold is real money from the NPC's purse", () => {
  it("an NPC can't promise more than it has", () => {
    expect(escrowFor(50, 60, 12)).toBe(12);
  });
  it("an NPC with an empty purse offers no gold (XP and amity only)", () => {
    expect(escrowFor(20, 20, 0)).toBe(0);
  });
  it("the severity cap still applies to a rich NPC", () => {
    expect(escrowFor(500, CAPS.minor.gold_max, 1000)).toBe(20);
  });
  it("junk or negative amounts escrow nothing", () => {
    expect(escrowFor("lots", 20, 100)).toBe(0);
    expect(escrowFor(-5, 20, 100)).toBe(0);
  });
  it("whatever was set aside but not paid out goes back to the funder", () => {
    expect(refundAfterPayout(20, 0)).toBe(20);   // declined / abandoned / failed
    expect(refundAfterPayout(20, 20)).toBe(0);   // paid in full
    expect(refundAfterPayout(30, 20)).toBe(10);  // a cap trimmed the payout
  });
});

describe("a player's board reward is paid in full, never clamped away", () => {
  it("picks the smallest severity whose cap covers the reward", () => {
    expect(severityForGold(5, CAPS)).toBe("trivial");
    expect(severityForGold(20, CAPS)).toBe("minor");
    expect(severityForGold(100, CAPS)).toBe("major");
  });
  it("refuses rewards larger than any quest can pay", () => {
    expect(severityForGold(601, CAPS)).toBeNull();
  });
  it("a posted 'visit' becomes a room quest; an item posting stays an item quest", () => {
    expect(questTargetKindFromBoard("visit")).toBe("room");
    expect(questTargetKindFromBoard(null)).toBe("room");
    expect(questTargetKindFromBoard("item")).toBe("item");
  });
});

describe("AI quest offers must point at something real (owner's decision: match or drop)", () => {
  it("a fetch quest for an item that matched the catalog keeps its real key", () => {
    expect(checkOfferTarget("fetch", "item", "flat-bread")).toEqual({ ok: true, target_kind: "item", target_ref: "flat-bread" });
  });
  it("a fetch, visit or slay quest with nothing real behind it is dropped", () => {
    expect(checkOfferTarget("fetch", "item", null).ok).toBe(false);
    expect(checkOfferTarget("visit", "room", null).ok).toBe(false);
    expect(checkOfferTarget("slay", "npc", null).ok).toBe(false);
  });
  it("a target of the wrong kind doesn't count (a 'slay' aimed at a room)", () => {
    expect(checkOfferTarget("slay", "room", "ash-road").ok).toBe(false);
  });
  it("talk and favour quests survive a fake target by losing it", () => {
    expect(checkOfferTarget("favor", "item", null)).toEqual({ ok: true, target_kind: null, target_ref: null });
  });
});

describe("a hungry NPC needs actual food, not just a visit", () => {
  it("the hunger want asks for a real item, so completion is checked against the pack", () => {
    const t = wantTarget("hunger", "maren-bakery");
    expect(t).toEqual({ kind: "item", ref: WANT_FOOD_ITEM });
    expect(completionMode({ kind: "favor", target_kind: t.kind, target_ref: t.ref }, { item: true, room: false, npc: false })).toBe("item");
    expect(questForWant("Maren", "hunger", "x")?.objective).toContain("flat bread");
  });
  it("other wants still send the player to a room", () => {
    expect(wantTarget("faith", "throne")).toEqual({ kind: "room", ref: "throne" });
  });
});
