// Rules for assaulting item and place Wardens (shatter / desecrate). Pure; used by warden-action
// and tests. Person wardens are destroyed by killing them in combat (DB trigger), not here.
// Canon: an Aether lives while any of its 12 Wardens stands (everbloom-lore/characters/wardens).

export type WardenVerb = "shatter" | "desecrate";
export const VERB_KIND: Record<WardenVerb, "item" | "place"> = { shatter: "item", desecrate: "place" };

/** One attempt per player per warden per hour, so a Warden can't be ground down by spam. */
export const ASSAULT_COOLDOWN_MS = 3_600_000;
/** A failed attempt hurts: the Warden lashes back for 1d6 (never below 1 HP). */
export const BACKLASH_DIE = 6;

export interface AssaultCheck {
  verb: WardenVerb;
  warden: { kind: string; aether_key: string; destroyed_at: string | null; room_slug: string | null };
  player: { aether: string | null; current_room: string };
  lastAttemptAt: string | null;
  now: Date;
}

/** Null if the attempt may go ahead, otherwise the in-world reason it can't. */
export function assaultBlocked(c: AssaultCheck): string | null {
  if (c.warden.destroyed_at) return "That Warden has already fallen.";
  if (c.warden.kind !== VERB_KIND[c.verb]) {
    return c.verb === "shatter" ? "That is no relic you could shatter." : "That is no sacred place you could desecrate.";
  }
  if (c.warden.room_slug !== c.player.current_room) return "It is not here.";
  if (c.player.aether === c.warden.aether_key) return "Your oath stays your hand. You cannot raise it against your own Aether.";
  if (c.lastAttemptAt && c.now.getTime() - Date.parse(c.lastAttemptAt) < ASSAULT_COOLDOWN_MS) {
    return "The Warden is still roused from your last attempt. Wait before you try again.";
  }
  return null;
}

/** HP after a failed attempt's backlash. */
export function afterBacklash(hp: number, damage: number): number {
  return Math.max(1, hp - damage);
}
