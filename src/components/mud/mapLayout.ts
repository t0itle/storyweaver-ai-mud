// Automap layout engine. Rooms carry no coordinates — the world is a graph of
// compass exits — so we lay them out MUD-style: BFS from an anchor room,
// stepping each compass exit one grid cell. First room to claim a cell keeps
// it; contested placements are skipped rather than drawn wrong.

export interface MapRoom {
  slug: string;
  name: string;
  exits: Record<string, string>;
  kind?: string | null;
  town_key?: string | null;
  requires_faction?: string | null;
}

export interface PlacedRoom {
  slug: string;
  x: number;
  y: number;
  dist: number; // BFS steps from the anchor
}

export interface MapEdge {
  from: string;
  to: string;
  dir: string;
}

export interface MapLayout {
  placed: Map<string, PlacedRoom>;
  edges: MapEdge[];
  // Non-compass exits (up/down/back/sanctum/…) between rooms — rendered as
  // badges rather than grid links.
  portals: { from: string; to: string; label: string }[];
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
}

export const COMPASS_VECTORS: Record<string, [number, number]> = {
  north: [0, -1],
  south: [0, 1],
  east: [1, 0],
  west: [-1, 0],
};

export function buildMapLayout(rooms: MapRoom[], anchorSlug: string, maxDist = Infinity): MapLayout {
  const bySlug = new Map(rooms.map((r) => [r.slug, r]));
  const placed = new Map<string, PlacedRoom>();
  const cellTaken = new Map<string, string>();
  const edges: MapEdge[] = [];
  const portals: { from: string; to: string; label: string }[] = [];
  const seenEdge = new Set<string>();

  if (bySlug.has(anchorSlug)) {
    const start: PlacedRoom = { slug: anchorSlug, x: 0, y: 0, dist: 0 };
    placed.set(anchorSlug, start);
    cellTaken.set("0,0", anchorSlug);
    const queue: PlacedRoom[] = [start];

    while (queue.length) {
      const cur = queue.shift()!;
      const room = bySlug.get(cur.slug);
      if (!room || cur.dist >= maxDist) continue;
      for (const [dir, to] of Object.entries(room.exits ?? {})) {
        if (typeof to !== "string" || !bySlug.has(to)) continue;
        const vec = COMPASS_VECTORS[dir];
        if (!vec) {
          portals.push({ from: cur.slug, to, label: dir });
          continue;
        }
        const edgeKey = [cur.slug, to].sort().join("→") + dir;
        if (placed.has(to)) {
          if (!seenEdge.has(edgeKey)) { seenEdge.add(edgeKey); edges.push({ from: cur.slug, to, dir }); }
          continue;
        }
        const nx = cur.x + vec[0];
        const ny = cur.y + vec[1];
        const key = `${nx},${ny}`;
        if (cellTaken.has(key)) continue; // grid conflict — don't draw a lie
        const p: PlacedRoom = { slug: to, x: nx, y: ny, dist: cur.dist + 1 };
        placed.set(to, p);
        cellTaken.set(key, to);
        queue.push(p);
        seenEdge.add(edgeKey);
        edges.push({ from: cur.slug, to, dir });
      }
    }
  }

  // Second pass: rooms only linked INTO the placed graph by a one-way exit
  // (a drop into a tomb, a wander back-road) never get visited by forward BFS.
  // Seat them by reversing their outgoing exit: if X --north--> P and P sits
  // at (x,y), X belongs at (x,y+1). Repeat until stable.
  let changed = true;
  while (changed) {
    changed = false;
    for (const r of rooms) {
      if (placed.has(r.slug)) continue;
      for (const [dir, to] of Object.entries(r.exits ?? {})) {
        if (typeof to !== "string") continue;
        const anchor = placed.get(to);
        const vec = COMPASS_VECTORS[dir];
        if (!anchor || !vec) continue;
        if (maxDist !== Infinity && anchor.dist + 1 > maxDist) continue;
        const nx = anchor.x - vec[0];
        const ny = anchor.y - vec[1];
        const key = `${nx},${ny}`;
        if (cellTaken.has(key)) continue;
        const p: PlacedRoom = { slug: r.slug, x: nx, y: ny, dist: anchor.dist + 1 };
        placed.set(r.slug, p);
        cellTaken.set(key, r.slug);
        edges.push({ from: r.slug, to, dir });
        changed = true;
        break;
      }
    }
  }

  let minX = 0, maxX = 0, minY = 0, maxY = 0;
  for (const p of placed.values()) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  return { placed, edges, portals, bounds: { minX, maxX, minY, maxY } };
}

// An edge is drawable when the two cells actually sit one step apart in the
// edge's direction; anything else (a loop closed far away on the grid) would
// slash across the map and mislead.
export function isEdgeDrawable(layout: MapLayout, e: MapEdge): boolean {
  const a = layout.placed.get(e.from);
  const b = layout.placed.get(e.to);
  const vec = COMPASS_VECTORS[e.dir];
  if (!a || !b || !vec) return false;
  return b.x - a.x === vec[0] && b.y - a.y === vec[1];
}

// Room-kind → map tint. Kept here so the mini map and the full map agree.
export function kindColor(kind: string | null | undefined, townKey?: string | null): string {
  if (townKey) return "hsl(36 45% 45%)";           // settlement — warm stone
  switch (kind) {
    case "road": case "bridge": case "gate": return "hsl(30 8% 40%)";
    case "desert": return "hsl(42 55% 42%)";
    case "wilds": case "grove": case "clearing": case "hollow": case "garden": return "hsl(120 25% 32%)";
    case "shore": case "dock": return "hsl(200 40% 38%)";
    case "cave": case "crypt": case "ruin": case "lair": return "hsl(270 15% 28%)";
    case "temple": case "hall": case "tower": return "hsl(45 35% 50%)";
    default: return "hsl(30 6% 33%)";
  }
}
