import { describe, it, expect } from "vitest";
import {
  kitRole, kitFor, startingPurse, partableKeys, maySell, PURSE_RANGE, KIT_LIMITS, type CatalogItem,
} from "../../supabase/functions/_shared/npcKit";

const item = (key: string, slot: string, value: number, extra: Partial<CatalogItem> = {}): CatalogItem =>
  ({ key, slot, value, tier: 1, base_damage: 0, base_armor: 0, ...extra });
const CATALOG: CatalogItem[] = [
  item("flat-bread", "consumable", 5), item("water-flask", "consumable", 4), item("twine", "misc", 2),
  item("spice-jar", "misc", 35),
  item("rusty-knife", "main_hand", 8, { base_damage: 2 }), item("curved-shortsword", "main_hand", 45, { base_damage: 3 }),
  item("woven-tunic", "body", 20, { base_armor: 1 }),
  item("dragon-plate", "body", 900, { base_armor: 8, tier: 4 }), item("relic-blade", "main_hand", 20, { base_damage: 9, tier: 3 }),
];
const ids = Array.from({ length: 60 }, (_, i) => `npc-${i}`);

describe("who gets a kit", () => {
  it("bosses, Aethers, souls and hireable companions keep what they have", () => {
    for (const f of [{ is_boss: true }, { is_aether: true }, { is_soul: true }, { hire_price_gold: 30 }])
      expect(kitRole(f)).toBe("none");
    expect(kitFor("none", "x", CATALOG)).toEqual([]);
    expect(startingPurse("none", "x")).toBe(0);
  });
  it("guards and wardens are guards; merchants, guildmasters, bards and fences are traders; the rest are residents", () => {
    expect(kitRole({ is_warden: true })).toBe("guard");
    expect(kitRole({ is_fence: true })).toBe("trader");
    expect(kitRole({})).toBe("resident");
  });
});

describe("kits are modest and real", () => {
  it("never hands out anything above tier 1 or outside the catalog", () => {
    const keys = new Set(CATALOG.map((c) => c.key));
    for (const id of ids) for (const role of ["resident", "guard", "trader"] as const)
      for (const l of kitFor(role, id, CATALOG)) {
        expect(keys.has(l.item_key)).toBe(true);
        expect(["dragon-plate", "relic-blade"]).not.toContain(l.item_key);
      }
  });
  it("a guard is armed and armoured, both equipped, so combat uses them", () => {
    const kit = kitFor("guard", "g1", CATALOG);
    expect(kit.find((l) => l.equipped_slot === "main_hand")).toBeTruthy();
    expect(kit.find((l) => l.equipped_slot === "body")?.item_key).toBe("woven-tunic");
  });
  it("residents carry 1–2 everyday goods worth at most the everyday limit", () => {
    for (const id of ids) {
      const goods = kitFor("resident", id, CATALOG).filter((l) => !l.equipped_slot);
      const n = goods.reduce((s, l) => s + l.quantity, 0);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(2);
      for (const l of goods) expect(CATALOG.find((c) => c.key === l.item_key)!.value).toBeLessThanOrEqual(KIT_LIMITS.everydayValue);
    }
  });
  it("roughly 1 in 3 residents carries a cheap weapon, never the guard's better blade", () => {
    const armed = ids.filter((id) => kitFor("resident", id, CATALOG).some((l) => l.equipped_slot === "main_hand"));
    expect(armed.length).toBeGreaterThan(ids.length / 6);
    expect(armed.length).toBeLessThan(ids.length / 2);
    for (const id of armed) expect(kitFor("resident", id, CATALOG).find((l) => l.equipped_slot)!.item_key).toBe("rusty-knife");
  });
  it("the same NPC always gets the same kit and purse (retries can't reroll)", () => {
    expect(kitFor("resident", "same", CATALOG)).toEqual(kitFor("resident", "same", CATALOG));
    expect(startingPurse("trader", "same")).toBe(startingPurse("trader", "same"));
  });
  it("an empty catalog gives an empty kit instead of inventing items", () => {
    expect(kitFor("guard", "g1", [])).toEqual([]);
  });
  it("purses stay inside each role's range", () => {
    for (const id of ids) for (const role of ["resident", "guard", "trader"] as const) {
      const p = startingPurse(role, id);
      expect(p).toBeGreaterThanOrEqual(PURSE_RANGE[role][0]);
      expect(p).toBeLessThanOrEqual(PURSE_RANGE[role][1]);
    }
  });
});

describe("an NPC can only sell what it has (owner's decision: carried + merchant trade goods)", () => {
  const carried = [
    { item_key: "flat-bread", equipped_slot: null, quantity: 2 },
    { item_key: "rusty-knife", equipped_slot: "main_hand", quantity: 1 },
  ];
  const partable = partableKeys(carried);
  it("sells what it carries in its pack", () => {
    expect(maySell("flat-bread", partable, new Set())).toBe("carried");
  });
  it("won't sell the weapon in its hand", () => {
    expect(maySell("rusty-knife", partable, new Set())).toBeNull();
  });
  it("a merchant can also sell its trade goods; nobody can sell something they don't have", () => {
    expect(maySell("spice-jar", partable, new Set(["spice-jar"]))).toBe("trade");
    expect(maySell("dragon-plate", partable, new Set(["spice-jar"]))).toBeNull();
  });
});
