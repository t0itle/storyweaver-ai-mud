import { describe, it, expect } from "vitest";
import { WORLD_CANON, kingdomLine } from "../../supabase/functions/_shared/worldCanon";

describe("world canon given to every AI prompt follows the wiki", () => {
  it("the Speaker withdrew (it was not silenced) and the First City is ruled by no Aether", () => {
    expect(WORLD_CANON).toMatch(/withdrew into silence/);
    expect(WORLD_CANON).not.toMatch(/silenced/);
    expect(WORLD_CANON).toMatch(/no Aether holds dominion/);
  });
  it("places a resident in their Aether's kingdom (wiki: Lazareth rules the Silent Horizon)", () => {
    expect(kingdomLine("lazareth")).toContain("the Silent Horizon");
    expect(kingdomLine("nyxara")).toContain("the Mirrorlands");
  });
  it("NPCs without a kingdom are told they live outside any dominion", () => {
    expect(kingdomLine(null)).toMatch(/outside the Aethers' dominion/);
    expect(kingdomLine("pyrrhus")).toMatch(/outside/);
  });
});
