// World-map consistency check.
//
// BFS from `gates-approach` over the rooms graph and assert every road, gate,
// and desert room is reachable. Also flag dangling exits (pointing at slugs
// that don't exist) and asymmetric one-way links (warning only — some
// intentional one-way drops exist, e.g. desert wander, hidden tomb).
//
// Run via supabase--test_edge_functions or:
//   deno test --allow-net --allow-env supabase/functions/_tests/world_map_test.ts
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL =
  Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL");
const SERVICE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  Deno.env.get("SUPABASE_ANON_KEY") ??
  Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY");

const START = "gates-approach";

const REQUIRED_GATES = [
  "first-city-gate",
  "sanctum-gate", "bastion-gate", "mirror-gate", "bazaar-gate",
  "horizon-gate", "vow-gate", "keep-gate",
];
const REQUIRED_CAPITALS = [
  "high-sanctum", "iron-bastion", "mirrorlands-court", "gilded-bazaar",
  "silent-horizon", "evershade-court", "feastlands-keep",
];

type Room = {
  slug: string;
  kind: string;
  hidden: boolean | null;
  requires_faction: string | null;
  // NOTE: if exits ever become richer objects ({to, locked, ...}) instead of
  // string slugs, adapt extractTargets() below.
  exits: Record<string, unknown> | null;
};

function extractTargets(exits: Record<string, unknown> | null): string[] {
  if (!exits) return [];
  const out: string[] = [];
  for (const v of Object.values(exits)) {
    if (typeof v === "string") out.push(v);
    else if (v && typeof v === "object" && "to" in v && typeof (v as { to: unknown }).to === "string") {
      out.push((v as { to: string }).to);
    }
  }
  return out;
}

Deno.test({
  name: "world map: every road, gate, and desert room is reachable from gates-approach",
  // supabase-js spins up a realtime heartbeat interval we don't use; ignore leaks.
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error(
      "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (or anon/publishable fallback). " +
      "Set them in the env or .env so the test can read the rooms table.",
    );
  }

  const supa = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data, error } = await supa
    .from("rooms")
    .select("slug,kind,hidden,requires_faction,exits");
  if (error) throw error;
  const rooms = (data ?? []) as Room[];
  if (rooms.length === 0) throw new Error("No rooms loaded — DB empty or RLS blocked the read.");

  const bySlug = new Map<string, Room>();
  for (const r of rooms) bySlug.set(r.slug, r);

  if (!bySlug.has(START)) {
    throw new Error(`Starting room '${START}' is missing from the rooms table.`);
  }

  // Dangling-exit check (fatal).
  const dangling: Array<{ from: string; to: string }> = [];
  for (const r of rooms) {
    for (const t of extractTargets(r.exits)) {
      if (!bySlug.has(t)) dangling.push({ from: r.slug, to: t });
    }
  }

  // BFS reachability.
  const reachable = new Set<string>([START]);
  const queue: string[] = [START];
  while (queue.length) {
    const cur = queue.shift()!;
    const room = bySlug.get(cur);
    if (!room) continue;
    for (const t of extractTargets(room.exits)) {
      if (!bySlug.has(t)) continue;
      if (reachable.has(t)) continue;
      reachable.add(t);
      queue.push(t);
    }
  }

  // What MUST be reachable: roads, gates, deserts — minus hidden / faction-gated.
  const requiredKinds = new Set(["road", "gate", "desert"]);
  const unreachable: Record<string, string[]> = {};
  for (const r of rooms) {
    if (!requiredKinds.has(r.kind)) continue;
    if (r.hidden) continue;
    if (r.requires_faction) continue;
    if (reachable.has(r.slug)) continue;
    (unreachable[r.kind] ??= []).push(r.slug);
  }

  // Required named gates + capitals (extra paranoia — kind alone may shift).
  const namedMissing: string[] = [];
  for (const slug of [...REQUIRED_GATES, ...REQUIRED_CAPITALS]) {
    if (!bySlug.has(slug)) namedMissing.push(`${slug} (room missing)`);
    else if (!reachable.has(slug)) namedMissing.push(`${slug} (unreachable)`);
  }

  // Asymmetric-link warning (non-fatal log).
  const asymmetric: Array<{ from: string; to: string }> = [];
  for (const r of rooms) {
    for (const t of extractTargets(r.exits)) {
      const other = bySlug.get(t);
      if (!other) continue;
      const back = extractTargets(other.exits);
      if (!back.includes(r.slug)) asymmetric.push({ from: r.slug, to: t });
    }
  }
  if (asymmetric.length) {
    console.warn(`[world-map] ${asymmetric.length} one-way exits (informational):`);
    for (const a of asymmetric.slice(0, 30)) console.warn(`  ${a.from} -> ${a.to}`);
    if (asymmetric.length > 30) console.warn(`  …and ${asymmetric.length - 30} more`);
  }

  // Build a friendly failure report.
  const problems: string[] = [];
  if (dangling.length) {
    problems.push(`Dangling exits (${dangling.length}):`);
    for (const d of dangling) problems.push(`  ${d.from} -> ${d.to} (missing)`);
  }
  for (const [kind, slugs] of Object.entries(unreachable)) {
    problems.push(`Unreachable ${kind} rooms (${slugs.length}): ${slugs.join(", ")}`);
  }
  if (namedMissing.length) {
    problems.push(`Required hubs broken: ${namedMissing.join(", ")}`);
  }

  if (problems.length) {
    throw new Error("World map check failed:\n" + problems.join("\n"));
  }

  // Sanity: the required hubs are present and reached.
  assertEquals(namedMissing.length, 0);
  },
});
