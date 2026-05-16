# Bake in the Light & Chaos quest lines

## What exists today
- **Alignment moments only**: `align-aether`, `declare-non-serviam`, `refuse-aethers`, `shadow-tempt`, `HallOfChoice.tsx` — these set `profiles.aether` / `profiles.faction` but **no quests follow**.
- `aether_loyalty(user_id, aether_key, step, status, completed_at)` exists and is **completely empty/unused**.
- No equivalent table or chain for the Chaos path.
- 7 Aethers live in `aethers` table; each has a `throne_room` and 12 wardens.

## What we'll build

### 1. Light path — Aether loyalty chain (7 quests per Aether)
For every Aether the player aligns with, a fixed 7-step questline unlocks at their throne city, themed to that Aether's domain & vow:

```text
Step 1 — "Kneel & Listen"     (visit throne room, hear the charge)
Step 2 — "A Small Mercy"      (themed deed in the capital — e.g. Solastin: shield a beggar; Morvayne: harvest grain for the poor)
Step 3 — "Mark of the Vow"    (cast/learn a rune tied to the Aether's element)
Step 4 — "Hunt a Heretic"     (defeat 1 Chaos-touched NPC in the wilds)
Step 5 — "The Warden's Word"  (talk to 3 specific wardens scattered in the kingdom)
Step 6 — "Bring the Relic"    (recover one Speaker artifact and gift it to the Aether)
Step 7 — "Take the Vow"       (final throne-room rite → Devout status, faction-locked reward)
```

Implementation:
- New table `aether_quest_steps` (seed data: 7 steps × 7 Aethers = 49 rows; reuses domain/vow flavor).
- Use existing `aether_loyalty.step` (0–7) to track progress.
- New edge function `aether-loyalty-action` (list / accept / advance / complete) called from a new **"Vows"** tab in `QuestsPanel`.
- Final reward: a unique faction-locked item per Aether + Merit +100 + `aether_loyalty.status = 'devout'`.
- Player can only walk one Aether's chain at a time; switching aethers resets progress.

### 2. Chaos path — Non Serviam chain (7 quests)
Triggered the moment `profiles.faction = 'chaos'` (after Non Serviam declared):

```text
Step 1 — "Burn the Veil"       (kill 3 Veiled in or near the First City)
Step 2 — "Whispers in the Tomb"(descend Tomb-Below, find the Unspoken Sigil)
Step 3 — "Crack a Warden"      (kill any 1 Aether warden of your choice)
Step 4 — "Spread the Pressure" (raise chaos_pressure in 3 different towns via NPC kills)
Step 5 — "Shadow's Pact"       (visit hidden Chaos altar, accept a corruption gift)
Step 6 — "Topple a Pillar"     (slay 6 wardens of a single Aether to weaken them)
Step 7 — "Crown of Refusal"    (return to gates-approach and broadcast the world event)
```

Implementation:
- New table `chaos_path(user_id PK, step, status, target_aether_key, last_advanced_at)`.
- New edge function `chaos-path-action` (list / accept / advance) — also a "Vows" tab entry, shown only when faction='chaos'.
- Step 4 already has infra: hook to `world_events` of kind `npc_killed` grouped by `r.town_key`.
- Final reward: unique relic + Merit +150 + unlocks Chaos-only encounters/whispers and a hidden epilogue trigger when ALL 7 Aethers are fallen.

### 3. UI surface
- Add a **"Vows"** tab to `QuestsPanel.tsx` showing the current chain's step, objective, and "Advance" / "Accept" actions.
- When in a throne room or Chaos altar, surface the next step inline as a button (similar to existing Hall of Choice buttons).
- Journal entries auto-write via existing `write_journal_from_world_event` trigger (we'll add `aether_step_completed` and `chaos_step_completed` kinds).

### 4. Hooks into existing systems
- `align-aether` → on success, insert/reset `aether_loyalty` row at step 0, status 'active'.
- `declare-non-serviam` → on success, insert `chaos_path` row at step 0.
- `restart-character` → wipe both tables for that user.
- `world-tick` (already cron) → no changes needed; the chains advance on player actions, not time.

## Technical details

**Migrations**:
- `aether_quest_steps(aether_key, step_index, title, objective, target_kind, target_ref, reward_xp, reward_gold, flavor)` + RLS readable.
- `chaos_path(user_id PK, step, status, target_aether_key, last_advanced_at)` + RLS own-row readable.
- Seed 49 aether_quest_steps rows in a follow-up `insert` call.

**New edge functions** (both `verify_jwt = false` in code, JWT validated manually):
- `aether-loyalty-action` — actions: `list`, `accept`, `advance`, `claim`.
- `chaos-path-action` — same surface.

**Edited**:
- `align-aether/index.ts` — seed `aether_loyalty` on success.
- `declare-non-serviam/index.ts` — seed `chaos_path` on success.
- `QuestsPanel.tsx` — add "Vows" tab + step display.
- `GameClient.tsx` — surface "Continue Vow" button when in throne room / Chaos altar.
- `restart-character/index.ts` — wipe both progress tables.

## Out of scope (for now)
- Full unique Chaos altar rooms (we'll reuse `gates-approach` Hall basin for Chaos Step 5 — placeholder).
- Per-step custom artwork or voice lines.
- PvP enforcement of faction conflicts.

Want me to proceed with this scope, or trim/expand any part first?
