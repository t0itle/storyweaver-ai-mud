import { describe, it, expect } from "vitest";
import { getTimeBucket, filterNpcsForBucket } from "@/components/mud/worldTime";

const atUtcHour = (h: number) => new Date(Date.UTC(2026, 0, 15, h, 30, 0));

describe("getTimeBucket", () => {
  it("maps each UTC hour to the right bucket", () => {
    expect(getTimeBucket(atUtcHour(0))).toBe("deepnight");
    expect(getTimeBucket(atUtcHour(4))).toBe("deepnight");
    expect(getTimeBucket(atUtcHour(5))).toBe("dawn");
    expect(getTimeBucket(atUtcHour(7))).toBe("dawn");
    expect(getTimeBucket(atUtcHour(8))).toBe("morning");
    expect(getTimeBucket(atUtcHour(11))).toBe("morning");
    expect(getTimeBucket(atUtcHour(12))).toBe("midday");
    expect(getTimeBucket(atUtcHour(15))).toBe("midday");
    expect(getTimeBucket(atUtcHour(16))).toBe("dusk");
    expect(getTimeBucket(atUtcHour(19))).toBe("dusk");
    expect(getTimeBucket(atUtcHour(20))).toBe("night");
    expect(getTimeBucket(atUtcHour(23))).toBe("night");
  });
});

describe("filterNpcsForBucket", () => {
  const npcs = [
    { name: "Maeve", is_merchant: true },
    { name: "Vell", is_fence: true },
    { name: "Guildmaster Orin", is_guildmaster: true },
    { name: "Old Senna" },
  ];

  it("keeps everyone outside deepnight", () => {
    for (const bucket of ["dawn", "morning", "midday", "dusk", "night"] as const) {
      expect(filterNpcsForBucket(npcs, bucket)).toHaveLength(4);
    }
  });

  it("closes shops at deepnight but keeps ordinary folk", () => {
    const out = filterNpcsForBucket(npcs, "deepnight");
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("Old Senna");
  });
});
