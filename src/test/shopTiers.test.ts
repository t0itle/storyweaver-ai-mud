import { describe, it, expect } from "vitest";
import { tierUnlocked } from "../../supabase/functions/_shared/shopTiers";

describe("shop tier gating", () => {
  it("Common and Fine are open to everyone", () => {
    expect(tierUnlocked(1, -50)).toBe(true);
    expect(tierUnlocked(2, 0)).toBe(true);
  });
  it("Masterwork needs 10 town rep", () => {
    expect(tierUnlocked(3, 9)).toBe(false);
    expect(tierUnlocked(3, 10)).toBe(true);
  });
  it("Relic needs 40 town rep", () => {
    expect(tierUnlocked(4, 39)).toBe(false);
    expect(tierUnlocked(4, 40)).toBe(true);
  });
});
