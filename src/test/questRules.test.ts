import { describe, it, expect } from "vitest";
import {
  completionMode, aiMayTriggerCompletion, arrivalCompletes, type QuestLite, type TargetExists,
} from "../../supabase/functions/_shared/questRules";

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
