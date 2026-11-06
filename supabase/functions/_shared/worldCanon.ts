// The short world summary every AI prompt starts from. Written from the wiki (everbloom-lore/),
// which is canon; change the wiki first, then this. Pure and dependency-free.
import { AETHERS } from "./decrees.ts";

export const WORLD_CANON =
  "EverBloom: the Speaker spoke the world out of the Light, then withdrew into silence so its people " +
  "could choose freely (\"What will you become, when you are free to choose?\"). Its echoes remain as " +
  "Relics. The Seven Aethers, each a Virtue bound to a Sin, rule the seven Crescent Kingdoms by bias " +
  "and through their Wardens. The neutral First City is maintained, not ruled, by the Veiled (the " +
  "mouth-bound Followers of the Speaker); no Aether holds dominion there. Beyond the Kingdoms lies the " +
  "Wilderness. Chaos, the Unbound, is the refusal of all alignment; its whisper is called the Shadow. " +
  "Dragons wake where gold lies hoarded. The age is the Quiet Rot: stable but stagnant, and myths " +
  "contradict each other from land to land.";

/** One line placing a person in their kingdom, or in neutral land. */
export function kingdomLine(aetherKey: string | null | undefined): string {
  const p = aetherKey ? AETHERS[aetherKey] : undefined;
  if (!p || !aetherKey) return "You live outside the Aethers' dominion (the First City, the Wilderness or the roads between).";
  const name = aetherKey[0].toUpperCase() + aetherKey.slice(1);
  return `You live in ${p.kingdom}, ruled by ${name}, ${p.title}, Aether of ${p.governs} (Virtue: ${p.virtue}; Sin: ${p.sin}). ` +
    `Your life and manners are shaped by ${name}'s bias, though what you think of your Aether is your own.`;
}
