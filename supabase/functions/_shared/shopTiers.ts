// Quality tiers for shop gear and the town reputation needed to see/buy each.
export const SHOP_TIER_NAMES = ["", "Common", "Fine", "Masterwork", "Relic"] as const;
export const SHOP_TIER_REP = [0, 0, 0, 10, 40] as const;
export const SHOP_STOCK_CAP = 90;

export function tierUnlocked(tier: number | null | undefined, townRep: number): boolean {
  const t = Math.min(4, Math.max(1, tier ?? 1));
  return t <= 2 || townRep >= SHOP_TIER_REP[t];
}
