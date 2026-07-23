# Character Creation Overhaul + Class System

Three connected pieces: (1) split creation into one-attribute-per-screen, (2) add a Class step with 12 starting classes and per-class skill trees, (3) add an Awakening evolution at level 15 with a generated unique attribute.

## 1. Multi-screen Character Creation

Rewrite `src/components/mud/CharacterCreation.tsx` into a stepper. Each step is one focused screen with back/next, keyboard support (Enter to advance), and a progress bar (Step X of Y).

Screens, in order:

1. **Name** — single input, min 2 chars, uniqueness check on blur.
2. **Gender** — Woman / Man (keeps the current 2-option rule).
3. **Race** — the existing race grid, one per screen (visual chooser).
4. **Class** — the new 12-class chooser (see §2 below), with class flavor + starting talent hint.
5. **Description** — freeform (min 8 chars, same rules as today's field).
6. **Starting direction** — north/south/east/west flavor choice (already collected today, kept for the journal line).
7. **Review + Awaken** — summary card, then a single "Step onto the road" button that calls `create-character`.

State lives in one `useReducer` in the component; nothing is persisted server-side until step 7 submits (matches today's behavior). Portrait generation still happens once, at submit.

## 2. 12 Classes + Class Skill Trees

Twelve starting classes, each with its own 8-node skill tree that sits *alongside* the existing Steel/Whisper/Sigil branches (the "normal" tree stays untouched — class trees are a fourth column that shows only your class).

Classes: **Warrior, Mage, Monk, Paladin, Ranger, Rogue, Summoner, Gambler, Bard, Alchemist, Necromancer, Runewright**.

Data model (new migration):

- `class_defs` — key, name, tagline, flavor, starting_hp_mod, starting_kit (jsonb: items granted at creation), awakening_quest_key.
- `class_skill_nodes` — same shape as `skill_nodes` but scoped by `class_key`; tiers 1–4, gated the same way (1 → 2 → 3 → capstone).
- `player_class_skills` — user_id, node_key. Uses the same `talent_points` pool as today.
- `profiles.class_key TEXT` — set at creation, immutable except via Awakening.

`spend-talent` extends to accept either a normal node key or a class node key (looks up in both tables). Same gating logic, same balance check.

`SkillTreePanel.tsx` grows a fourth column titled with the player's class name, rendered only when `profile.class_key` is set. `usePlayerSkills` fetches both node sets in parallel.

## 3. Awakening at Level 15

When a player hits level 15, the existing `handle_profile_xp_change` trigger flags `profiles.awakening_available = true` and posts a system message: *"Something is stirring in you. Seek the Mirror of Becoming."*

- New NPC per capital: **Mirror of Becoming** (reuses the existing mirror-well rooms). Talking to it while `awakening_available` opens a modal listing 2 evolved forms per class (e.g. Warrior → Warlord / Blade Saint; Summoner → Beastlord / Voidcaller).
- Choosing one starts an **Awakening Quest** — a scripted 3-step quest inserted into `quests` (kill/collect/deliver, class-flavored). Standard quest UI, no new systems.
- On quest completion, `quest-award` calls the new edge function **`awaken-class`**:
  - Sets `profiles.awakened_class TEXT` and `profiles.awakened_at`.
  - Grants the awakened class's capstone node for free.
  - Calls Lovable AI (`google/gemini-2.5-flash`, cheap text) once to generate the player's **unique attribute** — a 2-sentence signature ability tailored to their `char_description` + chosen awakened form. Stored in `profiles.unique_attribute JSONB` `{ name, description, effect_note }`.
  - The unique attribute displays on the Character Sheet as a glowing "Signature" card. It is flavor + a small mechanical hook (a re-roll, a +N to a specific check, an environmental interaction) — kept narrow so it doesn't destabilize combat.

Awakening is one-shot per character. `unique_attribute` is generated once and cached; players can re-read but not re-roll.

## Technical Details

- Migration order: `class_defs` → seed 12 classes → `class_skill_nodes` → seed 96 nodes (8 per class) → `player_class_skills` → profile columns (`class_key`, `awakened_class`, `awakened_at`, `awakening_available`, `unique_attribute`).
- All new public tables get `GRANT SELECT` to authenticated, `GRANT ALL` to service_role, RLS enabled, and a `has_role`-style policy where writes are service-only (edge functions do them).
- `create-character` accepts `class_key`, validates it, writes it to the profile, and inserts the class's starting kit into `player_items`.
- `spend-talent` unified lookup: try `skill_nodes` first, then `class_skill_nodes`; branch/tier gating uses whichever set the node lives in.
- Awakening quest content lives in seed data so it can be tuned without code changes.
- No changes to combat, movement, or the map.

## Out of scope for this pass

- Class balance tuning (starter numbers, refine later).
- Awakened forms beyond 2 per class (can grow).
- Class-locked equipment (all gear remains class-neutral for now).

Say the word and I'll ship it. This is a big one — I'd suggest breaking delivery into three PRs matching §1, §2, §3, but I can do it all in one go if you'd rather.
