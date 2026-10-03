import { describe, it, expect } from "vitest";
import { guildRankFor } from "../../supabase/functions/_shared/guildRanks";

describe("guild rank thresholds", () => {
  it("0 xp is Initiate", () => expect(guildRankFor(0)).toBe(0));
  it("99 xp still Initiate, 100 is Journeyman", () => {
    expect(guildRankFor(99)).toBe(0);
    expect(guildRankFor(100)).toBe(1);
  });
  it("300 Adept, 700 Master, 1500 Grandmaster", () => {
    expect(guildRankFor(300)).toBe(2);
    expect(guildRankFor(700)).toBe(3);
    expect(guildRankFor(1500)).toBe(4);
  });
});
