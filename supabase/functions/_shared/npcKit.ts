// What an NPC owns: a starting purse and a kit of real catalog items, chosen by code from its role.
// Pure, dependency-free; used by _shared/npcOutfit.ts and tested in src/test/npcKit.test.ts.
//
// Owner's decisions (quest phase 3): kits are "modest", the same NPC always gets the same kit (hashed
// from its id, no randomness), and NPCs are outfitted on first contact. Bosses, Aethers, souls and
// hireable companions keep what they have.
import { fnv1a } from "./npcMind.ts";

export type KitRole = "none" | "resident" | "guard" | "trader";

export interface NpcKitFlags {
  is_boss?: boolean | null; is_aether?: boolean | null; is_soul?: boolean | null;
  is_guard?: boolean | null; is_warden?: boolean | null;
  is_merchant?: boolean | null; is_guildmaster?: boolean | null; is_bard?: boolean | null; is_fence?: boolean | null;
  hire_price_gold?: number | null;
}

export function kitRole(n: NpcKitFlags): KitRole {
  if (n.is_boss || n.is_aether || n.is_soul || (n.hire_price_gold ?? 0) > 0) return "none";
  if (n.is_guard || n.is_warden) return "guard";
  if (n.is_merchant || n.is_guildmaster || n.is_bard || n.is_fence) return "trader";
  return "resident";
}

/** Starting gold ranges by role, inclusive. */
export const PURSE_RANGE: Record<Exclude<KitRole, "none">, [number, number]> = {
  resident: [5, 30],
  guard: [20, 50],
  trader: [60, 150],
};

const roll = (npcId: string, tag: string, n: number) => (n <= 0 ? 0 : fnv1a(`${npcId}:${tag}`) % n);

export function startingPurse(role: KitRole, npcId: string): number {
  if (role === "none") return 0;
  const [lo, hi] = PURSE_RANGE[role];
  return lo + roll(npcId, "purse", hi - lo + 1);
}

/** Catalog fields the kit picker needs. */
export interface CatalogItem {
  key: string; slot: string; value: number; tier: number; base_damage: number; base_armor: number;
}
export interface KitLine { item_key: string; quantity: number; equipped_slot: string | null }

/** Ceilings that keep kits modest: everyday goods, cheap weapons, plain armour, nothing above tier 1. */
export const KIT_LIMITS = { everydayValue: 15, traderGoodsValue: 40, residentWeaponValue: 30, guardWeaponValue: 60, armourValue: 80, maxTier: 1 };
/** 1 in N residents carries a cheap weapon. */
export const RESIDENT_ARMED_ONE_IN = 3;

function pick(pool: CatalogItem[], npcId: string, tag: string): CatalogItem | null {
  if (!pool.length) return null;
  const sorted = [...pool].sort((a, b) => a.key.localeCompare(b.key));
  return sorted[roll(npcId, tag, sorted.length)];
}

/**
 * The kit for one NPC, picked from the live catalog. Only real catalog keys can come out of this,
 * and the result depends only on (role, npcId, catalog), so retries give the same kit.
 */
export function kitFor(role: KitRole, npcId: string, catalog: CatalogItem[]): KitLine[] {
  if (role === "none") return [];
  const ok = catalog.filter((c) => (c.tier ?? 1) <= KIT_LIMITS.maxTier);
  const goods = (max: number) => ok.filter((c) => (c.slot === "consumable" || c.slot === "misc") && c.value <= max);
  const weapons = (max: number) => ok.filter((c) => c.slot === "main_hand" && c.base_damage > 0 && c.value <= max);
  const armour = ok.filter((c) => c.slot === "body" && c.base_armor > 0 && c.value <= KIT_LIMITS.armourValue);

  const lines: KitLine[] = [];
  const carry = (it: CatalogItem | null, equip = false) => {
    if (!it) return;
    const same = lines.find((l) => l.item_key === it.key && !l.equipped_slot && !equip);
    if (same) same.quantity++;
    else lines.push({ item_key: it.key, quantity: 1, equipped_slot: equip ? it.slot : null });
  };

  if (role === "guard") {
    carry(pick(weapons(KIT_LIMITS.guardWeaponValue), npcId, "weapon"), true);
    carry(pick(armour, npcId, "armour"), true);
    carry(pick(goods(KIT_LIMITS.everydayValue), npcId, "goods0"));
    return lines;
  }
  const max = role === "trader" ? KIT_LIMITS.traderGoodsValue : KIT_LIMITS.everydayValue;
  const count = 1 + roll(npcId, "goods-count", 2);   // 1–2 items
  for (let i = 0; i < count; i++) carry(pick(goods(max), npcId, `goods${i}`));
  if (role === "resident" && roll(npcId, "armed", RESIDENT_ARMED_ONE_IN) === 0) {
    carry(pick(weapons(KIT_LIMITS.residentWeaponValue), npcId, "weapon"), true);
  }
  return lines;
}

/** Items an NPC can part with: what it carries but isn't wearing or wielding. */
export function partableKeys(carried: { item_key: string; equipped_slot: string | null; quantity: number }[]): Set<string> {
  return new Set(carried.filter((c) => !c.equipped_slot && (c.quantity ?? 0) > 0).map((c) => c.item_key));
}

/**
 * Whether an NPC may sell an item in conversation (owner's decision): anything it carries and isn't
 * wearing, and, for a merchant, any good in its trade categories (unlimited, like its market stall).
 */
export function maySell(itemKey: string, partable: Set<string>, merchantGoods: Set<string>): "carried" | "trade" | null {
  if (partable.has(itemKey)) return "carried";
  if (merchantGoods.has(itemKey)) return "trade";
  return null;
}
