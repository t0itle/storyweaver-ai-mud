import { describe, expect, it } from "vitest";
import capitals from "../../docs/capital-districts.json";

describe("capital districts", () => {
  it("provides inhabited shopping districts for all seven Aether capitals", () => {
    expect(capitals.map((c) => c.town).sort()).toEqual([
      "evershade-court", "feastlands-keep", "gilded-bazaar", "high-sanctum",
      "iron-bastion", "mirrorlands-court", "silent-horizon",
    ]);
    for (const capital of capitals) {
      expect([capital.street, capital.artisan, capital.residential, capital.civic,
        capital.weapons, capital.armor, capital.arcana, capital.provisions].filter(Boolean)).toHaveLength(8);
      expect([capital.smith, capital.armorer, capital.arcanist, capital.grocer,
        capital.resident, capital.clerk].filter(Boolean)).toHaveLength(6);
    }
  });
  it("never copies residents between capitals", () => {
    const names = capitals.flatMap((c) => [c.smith, c.armorer, c.arcanist, c.grocer, c.resident, c.clerk]);
    expect(new Set(names).size).toBe(42);
  });
  it("keeps Lazareth and Nyxara in their own capitals", () => {
    expect(capitals.find((c) => c.aether === "Lazareth")?.town).toBe("silent-horizon");
    expect(capitals.find((c) => c.aether === "Nyxara")?.town).toBe("mirrorlands-court");
  });
});