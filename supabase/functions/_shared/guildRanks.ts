// Guild rank ladder driven by Guild XP. Shared by guild-action, quest-award and tests.
export const GUILD_RANK_NAMES = ["Initiate", "Journeyman", "Adept", "Master", "Grandmaster"];
export const GUILD_XP_THRESHOLDS = [0, 100, 300, 700, 1500];
export const GUILD_XP_PER_QUEST = 50;
export const GUILD_XP_WEEKLY_BONUS = 100;

export function guildRankFor(xp: number): number {
  let r = 0;
  for (let i = 0; i < GUILD_XP_THRESHOLDS.length; i++) if (xp >= GUILD_XP_THRESHOLDS[i]) r = i;
  return r;
}

// Deterministic daily/weekly board picks so every member of a chapter sees the same board.
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function boardPicks<T extends { id: string }>(tpls: T[], seed: string, n: number): T[] {
  return [...tpls].sort((a, b) => hash(seed + a.id) - hash(seed + b.id)).slice(0, n);
}
export function dayKey(d = new Date()) { return d.toISOString().slice(0, 10); }
export function weekKey(d = new Date()) { return "w" + Math.floor(d.getTime() / (7 * 86400000)); }
