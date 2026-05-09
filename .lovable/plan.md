## Goal
Reshape the world so the route is always: **Road → Gate → City Streets → Gate → Road → (long walk) → next City**, with players starting on the road just outside the First City.

## What changes

### 1. New starting point
- New room `gates-approach` (kind=`road`, "The Approach of Seven Sigils") sits one step south of `first-city-gate`.
- `create-character` edge function starts every new player here regardless of north/south choice.
- From `gates-approach` players see the gate looming north, the Crescent Shore behind them (south), the desert (east) and the wilds (west) — the three "outside" zones still reachable but no longer the starting point.

### 2. Long roads between cities
Each of the 7 capitals currently has a 2-room road. Extend every corridor to **5 road rooms + 1 entry-gate room** between the First City Gate and the capital, so the walk is meaningful.

```text
first-city-gate
  ├─ pilgrim-causeway → sun-blanched-mile → ember-mile → pilgrim-rise → solar-foothills → sanctum-gate → high-sanctum
  ├─ ironroad → slag-mile → cinder-mile → forge-rise → slag-flats → bastion-gate → iron-bastion
  ├─ mirror-pass → veil-mile → glass-mile → reflection-rise → glassmere → mirror-gate → mirrorlands-court
  ├─ caravan-spur → coin-mile → spice-mile → broker-rise → goldwash → bazaar-gate → gilded-bazaar
  ├─ star-stairs → hush-mile → ink-mile → archive-rise → hush-pines → horizon-gate → silent-horizon
  ├─ vow-walk-road → vigil-mile → silver-mile → mourner-rise → silver-pines → vow-gate → evershade-court
  └─ hearth-road → grain-mile → orchard-mile → harvest-rise → barley-flats → keep-gate → feastlands-keep
```

That's **3 new road-rooms + 1 new gate-room per route × 7 routes = 28 new rooms**, plus the new starting room (29 total). Each capital's "south" exit now goes to its gate room instead of the first road room.

### 3. Capital ↔ road wiring
- Every capital's outer-most exit (currently `south: <first road>`) becomes `south: <capital-gate>`.
- Every capital-gate room links `in: <capital>` and `out: <last road room before gate>`.
- The road chain uses `north`/`south` so movement is intuitive instead of `in`/`out`.

### 4. Cleanup
- Remove the legacy direct named exits from `first-city-gate` to capitals (`sanctum`, `bastion`, etc. already point at road heads — keep them, they're fine).
- Update wagon hub list so wagonmasters only sit at the First City Gate and each capital-gate (not mid-road).
- `crescent-shore`, `desert-verge`, wilderness, tomb — all left alone, just no longer the spawn point.

## Technical notes
- One migration inserts the 29 new rooms and rewires the relevant exits via `INSERT … ON CONFLICT DO NOTHING` and targeted `UPDATE rooms SET exits = …` for each capital + each existing road head.
- One small edit to `supabase/functions/create-character/index.ts` to set `startRoom = 'gates-approach'` for both directions.
- Memory file `mem://lore/crescent-kingdoms` updated to describe the road→gate→street→gate→road grammar.

No edge-function or UI changes beyond the start-room constant.