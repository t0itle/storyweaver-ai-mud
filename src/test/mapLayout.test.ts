import { describe, it, expect } from "vitest";
import { buildMapLayout, isEdgeDrawable, kindColor, type MapRoom } from "@/components/mud/mapLayout";

const room = (slug: string, exits: Record<string, string>, extra: Partial<MapRoom> = {}): MapRoom =>
  ({ slug, name: slug, exits, ...extra });

describe("buildMapLayout", () => {
  it("places compass neighbours on the grid around the anchor", () => {
    const rooms = [
      room("center", { north: "n", south: "s", east: "e", west: "w" }),
      room("n", { south: "center" }),
      room("s", { north: "center" }),
      room("e", { west: "center" }),
      room("w", { east: "center" }),
    ];
    const layout = buildMapLayout(rooms, "center");
    expect(layout.placed.get("center")).toMatchObject({ x: 0, y: 0, dist: 0 });
    expect(layout.placed.get("n")).toMatchObject({ x: 0, y: -1, dist: 1 });
    expect(layout.placed.get("s")).toMatchObject({ x: 0, y: 1, dist: 1 });
    expect(layout.placed.get("e")).toMatchObject({ x: 1, y: 0, dist: 1 });
    expect(layout.placed.get("w")).toMatchObject({ x: -1, y: 0, dist: 1 });
    expect(layout.bounds).toEqual({ minX: -1, maxX: 1, minY: -1, maxY: 1 });
  });

  it("respects maxDist", () => {
    const rooms = [
      room("a", { east: "b" }),
      room("b", { east: "c", west: "a" }),
      room("c", { west: "b" }),
    ];
    const layout = buildMapLayout(rooms, "a", 1);
    expect(layout.placed.has("b")).toBe(true);
    expect(layout.placed.has("c")).toBe(false);
  });

  it("skips placement on grid collisions instead of overlapping", () => {
    // Two different rooms both one step east of rooms at the same column —
    // b (east of a) and x (north of a, east exit to y at the same cell as… )
    // Construct: a --east--> b, a --north--> c, c --south--> d (cell of a is taken).
    const rooms = [
      room("a", { east: "b", north: "c" }),
      room("b", { west: "a" }),
      room("c", { south: "d" }), // d would land on a's cell (0,0) — must be skipped
      room("d", {}),
    ];
    const layout = buildMapLayout(rooms, "a");
    expect(layout.placed.has("d")).toBe(false);
    expect(layout.placed.size).toBe(3);
  });

  it("treats non-compass exits as portals, not grid links", () => {
    const rooms = [
      room("inn", { up: "loft", north: "street" }),
      room("loft", { down: "inn" }),
      room("street", { south: "inn" }),
    ];
    const layout = buildMapLayout(rooms, "inn");
    expect(layout.placed.has("loft")).toBe(false);
    expect(layout.portals.some((p) => p.from === "inn" && p.to === "loft" && p.label === "up")).toBe(true);
    expect(layout.placed.has("street")).toBe(true);
  });

  it("ignores exits that point at rooms missing from the atlas", () => {
    const rooms = [room("a", { east: "ghost" })];
    const layout = buildMapLayout(rooms, "a");
    expect(layout.placed.size).toBe(1);
    expect(layout.edges).toHaveLength(0);
  });

  it("seats rooms linked only by a one-way exit via the reverse pass", () => {
    // hidden-tomb drops INTO the crypt (one-way): crypt has no exit back.
    // Forward BFS from the crypt can't find hidden-tomb, but its own
    // south-exit anchors it one cell north of the crypt.
    const rooms = [
      room("crypt", { east: "hall" }),
      room("hall", { west: "crypt" }),
      room("hidden-tomb", { south: "crypt" }),
    ];
    const layout = buildMapLayout(rooms, "crypt");
    expect(layout.placed.get("hidden-tomb")).toMatchObject({ x: 0, y: -1 });
  });

  it("returns an empty layout when the anchor is unknown", () => {
    const layout = buildMapLayout([room("a", {})], "nowhere");
    expect(layout.placed.size).toBe(0);
  });
});

describe("isEdgeDrawable", () => {
  it("only draws edges between cells one step apart in the edge direction", () => {
    // a→b east is drawable; the long way round closes a loop whose final edge
    // may span multiple cells and must not be drawn.
    const rooms = [
      room("a", { east: "b" }),
      room("b", { west: "a", east: "c" }),
      room("c", { west: "b", north: "a" }), // c north→a is a 'bent' link on the grid
    ];
    const layout = buildMapLayout(rooms, "a");
    const eastEdge = layout.edges.find((e) => e.from === "a" && e.to === "b");
    const bentEdge = layout.edges.find((e) => e.dir === "north");
    expect(eastEdge && isEdgeDrawable(layout, eastEdge)).toBe(true);
    if (bentEdge) expect(isEdgeDrawable(layout, bentEdge)).toBe(false);
  });
});

describe("kindColor", () => {
  it("gives settlements their own tint regardless of kind", () => {
    expect(kindColor("road", "first-city")).toBe(kindColor("desert", "first-city"));
  });
  it("falls back to a default for unknown kinds", () => {
    expect(kindColor("weird-new-kind")).toBe(kindColor(undefined));
  });
});
