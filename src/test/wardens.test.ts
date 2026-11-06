import { describe, it, expect } from "vitest";
import { assaultBlocked, afterBacklash, ASSAULT_COOLDOWN_MS, type AssaultCheck } from "../../supabase/functions/_shared/wardens";

const now = new Date("2026-11-06T12:00:00Z");
const base: AssaultCheck = {
  verb: "shatter",
  warden: { kind: "item", aether_key: "khalvaris", destroyed_at: null, room_slug: "dueling-pit" },
  player: { aether: "thalvora", current_room: "dueling-pit" },
  lastAttemptAt: null, now,
};

describe("assaulting item and place Wardens", () => {
  it("allows a stranger standing at a relic to try to shatter it", () => {
    expect(assaultBlocked(base)).toBeNull();
  });
  it("relics are shattered and places desecrated, not the other way round", () => {
    expect(assaultBlocked({ ...base, verb: "desecrate" })).toMatch(/no sacred place/);
  });
  it("you must be where the Warden is", () => {
    expect(assaultBlocked({ ...base, player: { ...base.player, current_room: "elsewhere" } })).toMatch(/not here/);
  });
  it("a sworn follower cannot raise a hand against their own Aether's Warden", () => {
    expect(assaultBlocked({ ...base, player: { ...base.player, aether: "khalvaris" } })).toMatch(/oath/);
  });
  it("a fallen Warden stays fallen", () => {
    expect(assaultBlocked({ ...base, warden: { ...base.warden, destroyed_at: "2026-11-01" } })).toMatch(/already fallen/);
  });
  it("one attempt per hour per Warden, so it can't be ground down by spam", () => {
    const recent = new Date(now.getTime() - ASSAULT_COOLDOWN_MS + 60_000).toISOString();
    const old = new Date(now.getTime() - ASSAULT_COOLDOWN_MS - 1).toISOString();
    expect(assaultBlocked({ ...base, lastAttemptAt: recent })).toMatch(/Wait/);
    expect(assaultBlocked({ ...base, lastAttemptAt: old })).toBeNull();
  });
  it("backlash hurts but never kills", () => {
    expect(afterBacklash(10, 4)).toBe(6);
    expect(afterBacklash(3, 6)).toBe(1);
  });
});
