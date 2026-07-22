// World clock — real-world UTC hour drives a six-bucket day shared by the
// room narration, ambience tints, and NPC shop-hours.

export type TimeBucket = "night" | "dawn" | "morning" | "midday" | "dusk" | "deepnight";

export function getTimeBucket(d: Date = new Date()): TimeBucket {
  const h = d.getUTCHours();
  if (h < 5) return "deepnight";
  if (h < 8) return "dawn";
  if (h < 12) return "morning";
  if (h < 16) return "midday";
  if (h < 20) return "dusk";
  return "night";
}

// Shop owners (merchants, fences, guildmasters running a counter) close up
// for the small hours and aren't present in the room during deepnight.
export function filterNpcsForBucket<T extends { is_merchant?: boolean | null; is_fence?: boolean | null; is_guildmaster?: boolean | null }>(
  list: T[], bucket: TimeBucket,
): T[] {
  if (bucket !== "deepnight") return list;
  return list.filter((n) => !n.is_merchant && !n.is_fence && !n.is_guildmaster);
}
