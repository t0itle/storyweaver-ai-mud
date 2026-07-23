import { useMemo, useRef, useEffect } from "react";
import { Map as MapIcon, X } from "lucide-react";
import {
  buildMapLayout, isEdgeDrawable, kindColor,
  COMPASS_VECTORS, type MapRoom,
} from "./mapLayout";

// ─────────────────────────────────────────────────────────────────
// MiniMap — sidebar automap centered on the player. Adjacent rooms
// are clickable (walks there); desert rooms show dashed wander
// arrows into the open sand. A button expands to the full world map.
// ─────────────────────────────────────────────────────────────────

const CELL = 30;       // grid pitch (px)
const NODE = 18;       // room square size (px)
const RADIUS = 3;      // rooms shown out to N steps → 7×7 viewport

export function MiniMap({
  rooms, currentSlug, currentExits, onGo, onTravel, onOpenFull, desertDepth = 0, desertLost = false,
  visited,
}: {
  rooms: MapRoom[];
  currentSlug: string;
  // The *player's* exits for the current room (includes personal unlocked exits).
  currentExits: Record<string, string>;
  onGo: (command: string) => void;
  onTravel: (slug: string, name: string) => void;
  onOpenFull: () => void;
  desertDepth?: number;
  desertLost?: boolean;
  /** Slugs the player has personally set foot in. When omitted, everything is treated as visited. */
  visited?: Set<string>;
}) {
  const layout = useMemo(() => buildMapLayout(rooms, currentSlug, RADIUS), [rooms, currentSlug]);
  const bySlug = useMemo(() => new Map(rooms.map((r) => [r.slug, r])), [rooms]);
  const current = bySlug.get(currentSlug);

  if (!current || layout.placed.size === 0) return null;

  const size = (RADIUS * 2 + 1) * CELL;
  const mid = size / 2;
  const px = (x: number) => mid + x * CELL;
  const py = (y: number) => mid + y * CELL;

  // Fog-of-war: a placed room is drawn if the player has visited it OR it's
  // one step from a visited room (the frontier — rendered as an unknown "?").
  const visitedSet = visited ?? null;
  const isVisited = (slug: string) => !visitedSet || visitedSet.has(slug);
  const isFrontier = (slug: string) => {
    if (!visitedSet || visitedSet.has(slug)) return false;
    for (const e of layout.edges) {
      if (e.from === slug && visitedSet.has(e.to)) return true;
      if (e.to === slug && visitedSet.has(e.from)) return true;
    }
    return false;
  };
  const isVisible = (slug: string) => isVisited(slug) || isFrontier(slug);

  // Which compass dirs walk to an adjacent placed room (for click targets).
  const dirBySlug = new Map<string, string>();
  for (const [dir, to] of Object.entries(currentExits ?? {})) {
    if (typeof to === "string") dirBySlug.set(to, dir);
  }

  const isDesert = current.kind === "desert";
  const wanderDirs = isDesert
    ? Object.keys(COMPASS_VECTORS).filter((d) => currentSlug === "deep-desert" || !currentExits?.[d])
    : [];


  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-mono text-[10px] uppercase tracking-widest text-ash">Map</h3>
        <button
          onClick={onOpenFull}
          className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-ash hover:text-ember transition-colors"
          title="Open the world map"
        >
          <MapIcon className="w-3 h-3" /> world
        </button>
      </div>
      <div className="border border-border bg-background/40 relative overflow-hidden" style={{ height: size }}>
        <svg width="100%" height={size} viewBox={`0 0 ${size} ${size}`} className="block">
          {/* connections */}
          {layout.edges.filter((e) => isEdgeDrawable(layout, e)).map((e, i) => {
            const a = layout.placed.get(e.from)!;
            const b = layout.placed.get(e.to)!;
            return (
              <line key={i}
                x1={px(a.x)} y1={py(a.y)} x2={px(b.x)} y2={py(b.y)}
                stroke="hsl(30 8% 30%)" strokeWidth={2} />
            );
          })}

          {/* desert wander arrows — the sands are always open */}
          {wanderDirs.map((d) => {
            const [vx, vy] = COMPASS_VECTORS[d];
            return (
              <g key={d} className="cursor-pointer" onClick={() => onGo(`go ${d}`)}>
                <line x1={px(0)} y1={py(0)} x2={px(vx * 0.85)} y2={py(vy * 0.85)}
                  stroke="hsl(42 55% 42%)" strokeWidth={1.5} strokeDasharray="3 3" opacity={0.7} />
                <circle cx={px(vx * 0.85)} cy={py(vy * 0.85)} r={7} fill="hsl(42 55% 42% / 0.25)"
                  stroke="hsl(42 55% 42%)" strokeWidth={1} strokeDasharray="2 2">
                  <title>Wander {d} into the open sand…</title>
                </circle>
              </g>
            );
          })}

          {/* rooms */}
          {[...layout.placed.values()].map((p) => {
            const r = bySlug.get(p.slug);
            if (!r) return null;
            const isHere = p.slug === currentSlug;
            const adjacentDir = dirBySlug.get(p.slug);
            const clickable = !isHere;
            const locked = !!r.requires_faction;
            return (
              <g key={p.slug}
                className={clickable ? "cursor-pointer" : undefined}
                onClick={() => {
                  if (isHere) return;
                  if (adjacentDir) onGo(`go ${adjacentDir}`);
                  else onTravel(r.slug, r.name);
                }}
              >
                <rect
                  x={px(p.x) - NODE / 2} y={py(p.y) - NODE / 2}
                  width={NODE} height={NODE} rx={3}
                  fill={isHere ? "hsl(var(--ember))" : kindColor(r.kind, r.town_key)}
                  opacity={locked && !isHere ? 0.45 : isHere ? 1 : 0.9}
                  stroke={isHere ? "hsl(var(--parchment, 40 30% 85%))" : "hsl(30 8% 18%)"}
                  strokeWidth={isHere ? 1.5 : 1}
                >
                  <title>{r.name}{locked ? " (sealed to outsiders)" : ""}{adjacentDir ? ` — go ${adjacentDir}` : isHere ? " — you are here" : " — set out"}</title>
                </rect>
                {isHere && (
                  <rect
                    x={px(p.x) - NODE / 2 - 3} y={py(p.y) - NODE / 2 - 3}
                    width={NODE + 6} height={NODE + 6} rx={5}
                    fill="none" stroke="hsl(var(--ember))" strokeWidth={1} opacity={0.6}
                  >
                    <animate attributeName="opacity" values="0.7;0.15;0.7" dur="2s" repeatCount="indefinite" />
                  </rect>
                )}
                {locked && !isHere && (
                  <text x={px(p.x)} y={py(p.y) + 4} textAnchor="middle" fontSize={10} fill="hsl(40 30% 80%)">⚿</text>
                )}
              </g>
            );
          })}
        </svg>
        <div className="absolute bottom-1 left-2 font-mono text-[9px] text-ash/70 pointer-events-none truncate max-w-[85%]">
          {current.name}
        </div>
      </div>
      {isDesert && (
        <p className="font-mono text-[9px] text-ash/60 italic mt-1">
          {desertDepth > 0 ? (
            <>
              {desertDepth} dune{desertDepth === 1 ? "" : "s"} deep ·{" "}
              {desertLost
                ? <span className="text-ember/80">bearings lost</span>
                : <span className="text-moss/80">bearing holds</span>}
            </>
          ) : (
            <>dashed paths wander into the dunes — the desert keeps its own map</>
          )}
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// WorldMapModal — the whole charted world laid out from where you
// stand. Scrollable; click any room to set out for it.
// ─────────────────────────────────────────────────────────────────

const W_CELL = 46;
const W_NODE = 26;

export function WorldMapModal({
  open, rooms, currentSlug, onClose, onGo, onTravel,
}: {
  open: boolean;
  rooms: MapRoom[];
  currentSlug: string;
  onClose: () => void;
  onGo: (command: string) => void;
  onTravel: (slug: string, name: string) => void;
}) {
  const layout = useMemo(
    () => (open ? buildMapLayout(rooms, currentSlug) : null),
    [open, rooms, currentSlug],
  );
  const bySlug = useMemo(() => new Map(rooms.map((r) => [r.slug, r])), [rooms]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Center the viewport on the player whenever the map opens.
  useEffect(() => {
    if (!open || !layout) return;
    const el = scrollRef.current;
    if (!el) return;
    const me = layout.placed.get(currentSlug);
    if (!me) return;
    const { minX, minY } = layout.bounds;
    const cx = (me.x - minX + 1) * W_CELL;
    const cy = (me.y - minY + 1) * W_CELL;
    el.scrollLeft = cx - el.clientWidth / 2;
    el.scrollTop = cy - el.clientHeight / 2;
  }, [open, layout, currentSlug]);

  if (!open || !layout || layout.placed.size === 0) return null;

  const { minX, maxX, minY, maxY } = layout.bounds;
  const width = (maxX - minX + 2) * W_CELL;
  const height = (maxY - minY + 2) * W_CELL;
  const px = (x: number) => (x - minX + 1) * W_CELL;
  const py = (y: number) => (y - minY + 1) * W_CELL;

  const currentRoom = bySlug.get(currentSlug);
  const adjacent = new Map<string, string>();
  for (const [dir, to] of Object.entries(currentRoom?.exits ?? {})) {
    if (typeof to === "string") adjacent.set(to, dir);
  }

  // Rooms worth labeling on the big map: settlements, gates, capitals, landmarks.
  const labeled = (r: MapRoom) =>
    !!r.town_key || r.kind === "gate" || r.kind === "temple" || r.kind === "desert";

  const LEGEND: [string, string][] = [
    ["settlement", kindColor(null, "x")],
    ["road / gate", kindColor("road")],
    ["desert", kindColor("desert")],
    ["wilds", kindColor("wilds")],
    ["water", kindColor("shore")],
    ["underdark", kindColor("cave")],
  ];

  return (
    <div className="fixed inset-0 z-50 bg-background/90 backdrop-blur-sm flex items-center justify-center p-2 sm:p-6" onClick={onClose}>
      <div className="bg-card border border-border w-full max-w-4xl h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <MapIcon className="w-4 h-4 text-ember" />
            <h2 className="font-display text-lg text-parchment">The Charted World</h2>
            <span className="font-mono text-[10px] text-ash uppercase tracking-widest hidden sm:inline">
              {layout.placed.size} places · click to set out
            </span>
          </div>
          <button onClick={onClose} className="text-ash hover:text-parchment"><X className="w-4 h-4" /></button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-auto scrollbar-thin bg-background/60">
          <svg width={width} height={height} className="block">
            {layout.edges.filter((e) => isEdgeDrawable(layout, e)).map((e, i) => {
              const a = layout.placed.get(e.from)!;
              const b = layout.placed.get(e.to)!;
              return (
                <line key={i} x1={px(a.x)} y1={py(a.y)} x2={px(b.x)} y2={py(b.y)}
                  stroke="hsl(30 8% 28%)" strokeWidth={2.5} />
              );
            })}
            {[...layout.placed.values()].map((p) => {
              const r = bySlug.get(p.slug);
              if (!r) return null;
              const isHere = p.slug === currentSlug;
              const dir = adjacent.get(p.slug);
              const locked = !!r.requires_faction;
              return (
                <g key={p.slug}
                  className={isHere ? undefined : "cursor-pointer"}
                  onClick={() => {
                    if (isHere) return;
                    onClose();
                    if (dir) onGo(`go ${dir}`);
                    else onTravel(r.slug, r.name);
                  }}
                >
                  <rect
                    x={px(p.x) - W_NODE / 2} y={py(p.y) - W_NODE / 2}
                    width={W_NODE} height={W_NODE} rx={4}
                    fill={isHere ? "hsl(var(--ember))" : kindColor(r.kind, r.town_key)}
                    opacity={locked && !isHere ? 0.45 : 0.95}
                    stroke={isHere ? "hsl(40 30% 85%)" : "hsl(30 8% 15%)"}
                    strokeWidth={isHere ? 2 : 1}
                  >
                    <title>{r.name}{locked ? " (sealed to outsiders)" : ""}</title>
                  </rect>
                  {isHere && (
                    <rect x={px(p.x) - W_NODE / 2 - 4} y={py(p.y) - W_NODE / 2 - 4}
                      width={W_NODE + 8} height={W_NODE + 8} rx={6}
                      fill="none" stroke="hsl(var(--ember))" strokeWidth={1.5} opacity={0.6}>
                      <animate attributeName="opacity" values="0.8;0.2;0.8" dur="2s" repeatCount="indefinite" />
                    </rect>
                  )}
                  {locked && !isHere && (
                    <text x={px(p.x)} y={py(p.y) + 5} textAnchor="middle" fontSize={13} fill="hsl(40 30% 80%)">⚿</text>
                  )}
                  {(isHere || labeled(r)) && (
                    <text
                      x={px(p.x)} y={py(p.y) + W_NODE / 2 + 11}
                      textAnchor="middle" fontSize={9}
                      fill={isHere ? "hsl(var(--ember))" : "hsl(30 10% 60%)"}
                      className="font-mono pointer-events-none"
                    >
                      {r.name.length > 20 ? r.name.slice(0, 19) + "…" : r.name}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {(() => {
          // Places that can't sit on the road-grid — reached by stair, tunnel,
          // wander, or rite. Still part of the world; still one click away.
          const elsewhere = rooms.filter((r) => !layout.placed.has(r.slug));
          if (elsewhere.length === 0) return null;
          return (
            <div className="border-t border-border px-4 py-2 max-h-24 overflow-y-auto scrollbar-thin">
              <span className="font-mono text-[9px] uppercase tracking-widest text-ash mr-2">Elsewhere — off the charted roads:</span>
              {elsewhere.map((r) => (
                <button
                  key={r.slug}
                  onClick={() => { onClose(); onTravel(r.slug, r.name); }}
                  className="font-mono text-[10px] text-whisper hover:text-ember underline underline-offset-2 mr-3"
                  title={`Set out for ${r.name}`}
                >
                  {r.name}
                </button>
              ))}
            </div>
          );
        })()}

        <div className="border-t border-border px-4 py-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          {LEGEND.map(([label, color]) => (
            <span key={label} className="flex items-center gap-1.5 font-mono text-[10px] text-ash">
              <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: color }} />
              {label}
            </span>
          ))}
          <span className="flex items-center gap-1.5 font-mono text-[10px] text-ember ml-auto">
            <span className="w-2.5 h-2.5 rounded-sm inline-block bg-[hsl(var(--ember))]" /> you are here
          </span>
        </div>
      </div>
    </div>
  );
}
