## Wilderness, Desert, Dragons & Chaos — Lore + Systems

Codify the new lore you described and wire it into the world: rooms, factions, and a dragon-aggro system tied to gold hoards.

### 1. Lore memory (no-code, pure canon)

Save three new memory files and update `mem://index.md` Core:

- **`mem://lore/wilderness`** — Lands beyond the Crescent Kingdoms. Pre-Aether, older than the current order. Indifferent to the seven, no Aether wardens patrol here. Rules of reality are looser; runes can drift.
- **`mem://lore/desert`** — Lies between the First City (one side, endless desert beyond it) and the Crescent Kingdoms (other side). Crossed only by caravans and pilgrims; the Veiled know its routes.
- **`mem://lore/dragons`** — Lords of their own time, dying race. Cruel + magnificently beautiful, distinct named personalities. **Attracted to large gold hoards** (kingdom treasuries or any single player carrying too much). Encountering one is endgame-tier.
- **`mem://lore/chaos`** — Counter-faction to the Aethers. Hunts Aether **wardens** first, then the Aethers themselves. If Chaos wins → reality-breaking endgame loss. Players may align **Chaos** as an alternative to an Aether (mutually exclusive with `profiles.aether`).

Update Core with the one-liners: "Wilderness = pre-Aether lands outside the Kingdoms. Desert sits between First City and the Kingdoms.", "Chaos faction hunts Aether wardens; Chaos victory = game over.", "Dragons are dying lords of time; large gold hoards attract them."

### 2. World map additions (DB migration)

Add new rooms in `rooms`:
- `wilderness-edge` (wilds) — frontier just past the Kingdoms' border
- `deep-wilds` (wilds) — deeper, where Aether law no longer holds
- `desert-verge` (desert) — Crescent-side dunes
- `caravan-road` (desert) — the trade route across
- `bone-dunes` (desert) — endless desert past the First City
- `dragon-roost` (lair) — hidden, not on any normal exit; only reachable when a dragon spawn-event fires

Wire exits: existing wilderness / waste-adjacent rooms (`whispering-wastes`, `ash-road`, `red-haze-road`) gain exits to `wilderness-edge` and `desert-verge`; `first-city-gate` ↔ `caravan-road` ↔ `bone-dunes`; `caravan-road` ↔ `desert-verge`.

### 3. Chaos alignment

- Add `'chaos'` as a valid value for `profiles.aether` (currently free text — just allow it). Add a sibling column **`faction`** (`'aether' | 'chaos' | null`) so we can keep the specific Aether key separate from the side they fight on; Chaos gets `faction='chaos'`, `aether=null`.
- Extend the existing `align-aether` edge function (or add `align-chaos`) so players can choose Chaos. Mutually exclusive with picking an Aether.
- Log `world_event` kind `chaos_aligned` (analogous to `aether_aligned`) and add a journal trigger case for it.

### 4. Dragon aggro system

New table **`dragons`**:
- `key` text PK, `name`, `personality` (text — cruel/regal flavor), `epithet`, `current_room` (nullable; null = slumbering), `hoard_target_room` (nullable), `last_woken_at`.

Seed 3 named dragons with distinct personalities (e.g., a vain gold-hoarder, a cold archivist of time, a wrathful sky-tyrant).

New edge function **`dragon-check`** (called from `world-tick` and after any large gold transfer):
- Compute total gold per room: sum of `profiles.gold` for players in that room + a future kingdom-treasury value.
- Threshold: any single player carrying > **500 gold**, or a room total > **2000 gold**, rolls a weighted chance to wake a sleeping dragon.
- On wake: set `dragons.current_room = <hoard_room>`, log `world_event` kind `dragon_stirs` (room-visible) and broadcast a system message ("The sky darkens. <Name> has caught the scent of gold.").
- A dragon in a room becomes a present NPC-equivalent: `npc-respond` and `interact` need to read `dragons` for the room and inject them into the "WHO IS PHYSICALLY HERE" block with their personality.

Client (`GameClient.tsx`): include dragons in the room's present-entities list and surface a warning in the HUD when the player's gold crosses the dragon-attraction threshold.

### 5. Chaos incursions (light first pass)

- Add `world_event` kind `chaos_incursion` — periodically rolled in `world-tick` against a kingdom capital. Logs in background; NPCs (especially Aether wardens) can reference recent incursions through the existing world-events context. Actual combat encounters can come later.

### Technical details

- Migration: add columns, seed rooms + dragons, extend `write_journal_from_world_event` switch with `chaos_aligned` and `dragon_stirs` cases.
- `align-aether/index.ts`: branch on `target === 'chaos'` to set `faction='chaos'` and skip `aether`.
- `world-tick/index.ts`: invoke `dragon-check` once per tick.
- `npc-respond/index.ts` + `interact/index.ts`: extend the "present entities" query to include `dragons` where `current_room = room`.
- `GameClient.tsx`: render dragons in the room presence list; show a subtle "Your hoard glints too brightly..." warning above the gold threshold.

### Out of scope (ask later)

- Full dragon combat / loot tables
- Kingdom-treasury data model (currently approximated by summed player gold in a room)
- Chaos cultist NPC archetypes and their dialogue trees
