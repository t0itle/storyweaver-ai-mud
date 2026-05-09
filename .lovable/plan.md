# World-map consistency check

## Goal
Catch broken map wiring before it ships. Whenever rooms or exits change, an automated test should fail loudly if a player can't walk from `gates-approach` to every road, every capital gate, and every desert room.

## What to build

A single Deno test file: `supabase/functions/_tests/world_map_test.ts`

The test:
1. Connects to the project DB using `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (already available in the test env, same pattern other edge functions use).
2. Loads every row from `rooms` (slug, kind, exits).
3. Builds an adjacency map from `exits` JSON (values are target slugs; ignore keys — direction names don't matter for reachability).
4. BFS from `gates-approach`.
5. Asserts:
   - **Every `kind = 'road'` room is reachable.**
   - **Every `kind = 'gate'` room is reachable.**
   - **Every `kind = 'desert'` room is reachable** (this is the regression that just bit us — the wilds→desert link).
   - No exit points to a missing slug (dangling reference).
6. On failure, prints the unreachable slugs grouped by kind so the fix is obvious.

Optional extra assertions (cheap, worth including):
- Every capital-gate room (`sanctum-gate`, `bastion-gate`, `mirror-gate`, `bazaar-gate`, `horizon-gate`, `vow-gate`, `keep-gate`) is reachable AND each of the 7 capital rooms (`high-sanctum`, `iron-bastion`, `mirrorlands-court`, `gilded-bazaar`, `silent-horizon`, `evershade-court`, `feastlands-keep`) is reachable.
- Symmetric-exit warning (non-fatal log): if room A → B but B has no exit back to A, print it. Useful for catching the `red-haze-road`/`wilderness-edge` style bugs without forcing every link to be two-way (some intentional one-way drops exist, e.g. desert wander, hidden tomb).

## How to run

`supabase--test_edge_functions` already runs `*_test.ts` files under `supabase/functions/`. The new file lives at `supabase/functions/_tests/world_map_test.ts` and runs alongside the rest. No config changes needed.

Manual run from anywhere:
```
deno test --allow-net --allow-env supabase/functions/_tests/world_map_test.ts
```

## Technical notes

- Read-only — no migrations, no edge-function code changes.
- Uses the same `@supabase/supabase-js@2.45.0` ESM import other functions use.
- Treats every value in `exits` as a target slug. If we ever introduce richer exit objects (`{to, locked}`), the test will need a tiny adapter — flagged in a code comment.
- Skips rooms with `hidden = true` from the *reachability* requirement (hidden rooms like `unspoken-hollow` and the Tomb-Below entrance are intentionally gated), but still checks their exits don't dangle.
- Skips `requires_faction` rooms from reachability (Chaos-only rooms can be unreachable for a vanilla player).

## Out of scope
- Auto-fixing broken links. The test only reports.
- UI surfacing. This is a developer-time check, not a runtime warning.
