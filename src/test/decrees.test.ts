import { describe, it, expect } from "vitest";
import {
  pickGod, GOD_INTERVAL_MS, validateDecrees, extractJson, godSystemPrompt, godDigestText, MAX_DECREES,
  type AetherRow, type KingdomDigest,
} from "../../supabase/functions/_shared/decrees";

const now = new Date("2026-11-05T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

describe("cadence: about seven god turns per day, shared by all gods", () => {
  it("nobody acts if any god spoke less than 24h/7 ago (caps AI calls)", () => {
    const gods: AetherRow[] = [{ key: "solastin", alive: true, last_decree_at: ago(GOD_INTERVAL_MS - 1000) },
      { key: "khalvaris", alive: true, last_decree_at: null }];
    expect(pickGod(gods, now)).toBeNull();
  });
  it("the god silent the longest goes next; never-spoken gods first", () => {
    const gods: AetherRow[] = [{ key: "solastin", alive: true, last_decree_at: ago(GOD_INTERVAL_MS * 3) },
      { key: "khalvaris", alive: true, last_decree_at: null }, { key: "nyxara", alive: true, last_decree_at: ago(GOD_INTERVAL_MS * 9) }];
    expect(pickGod(gods, now)?.key).toBe("khalvaris");
  });
  it("fallen gods issue no decrees — their kingdoms drift", () => {
    const gods: AetherRow[] = [{ key: "solastin", alive: false, last_decree_at: null },
      { key: "nyxara", alive: true, last_decree_at: ago(GOD_INTERVAL_MS * 2) }];
    expect(pickGod(gods, now)?.key).toBe("nyxara");
    expect(pickGod([{ key: "solastin", alive: false, last_decree_at: null }], now)).toBeNull();
  });
  it("ignores aethers that aren't one of the Seven", () => {
    expect(pickGod([{ key: "pyrrhus", alive: true, last_decree_at: null }], now)).toBeNull();
  });
});

describe("decree validation: the god chooses, code decides", () => {
  const kingdom = new Set(["n1", "n2"]);
  it("accepts well-formed decrees for the god's own subjects", () => {
    const r = validateDecrees({ proclamation: "Hear me.", decrees: [
      { type: "set_goal", npc_id: "n1", goal: "Guard the well" },
      { type: "law", text: "No blades drawn", days: 30 },
      { type: "bond", npc_a: "n1", npc_b: "n2", label: "rival", affinity: -500 },
    ] }, kingdom);
    expect(r.rejected).toEqual([]);
    expect(r.decrees[1]).toEqual({ type: "law", text: "No blades drawn", days: 7 });   // clamped to 7 days
    expect(r.decrees[2]).toMatchObject({ affinity: -100 });                              // clamped
  });
  it("rejects NPCs outside the kingdom, unknown types and bad labels", () => {
    const r = validateDecrees({ decrees: [
      { type: "set_goal", npc_id: "stranger", goal: "x" },
      { type: "give_gold", amount: 9999 },
      { type: "bond", npc_a: "n1", npc_b: "n2", label: "overlord" },
    ] }, kingdom);
    expect(r.decrees).toEqual([]);
    expect(r.rejected).toHaveLength(3);
  });
  it(`applies at most ${MAX_DECREES} decrees`, () => {
    const r = validateDecrees({ decrees: Array(6).fill({ type: "festival" }) }, kingdom);
    expect(r.decrees).toHaveLength(MAX_DECREES);
  });
  it("survives garbage", () => {
    expect(validateDecrees(null, kingdom)).toEqual({ proclamation: null, decrees: [], rejected: [] });
    expect(validateDecrees({ decrees: "lots" }, kingdom).decrees).toEqual([]);
  });
  it("extracts JSON from a chatty or fenced reply", () => {
    expect(extractJson('Here:\n```json\n{"proclamation":"x","decrees":[]}\n```')).toEqual({ proclamation: "x", decrees: [] });
    expect(extractJson("no json")).toBeNull();
  });
});

describe("the god's prompt", () => {
  const d: KingdomDigest = {
    aetherKey: "thalvora", aetherName: "Thalvora", capitalName: "Gilded Bazaar",
    agents: [{ id: "n1", name: "Maren", title: "baker", mood: "hungry", wants: ["I haven't eaten"], goals: [] }],
    eventCounts: { steal_failed: 2 }, swornPlayers: 3, forsakenPlayers: 1, activeLaws: [], rivalDecrees: [],
  };
  it("speaks as the god of its own domain", () => {
    expect(godSystemPrompt(d)).toContain("Aether of Trade");
  });
  it("lists subjects by id so decrees can target them, plus rivals from divine politics", () => {
    const t = godDigestText(d);
    expect(t).toContain("n1 | Maren");
    expect(t).toContain("morvayne: rivals over the price of grain");
  });
});
