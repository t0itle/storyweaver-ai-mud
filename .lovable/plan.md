## Skill Tree — "The Long Path"

A talent tree the player opens on level-up. Each node grants a small, almost-invisible benefit. Nodes connect along three braided branches; deep nodes unlock subtle but decisive endgame effects.

### Earning points
- 1 talent point per level (retroactive on first open — players keep the points they've already earned).
- Points are spent in `skill_tree` modal; nothing happens automatically.

### The three branches

Each branch has 8 nodes (24 total). Tiers 1–3 are tiny percentages; tier 4 is a small but distinctive capstone.

**Steel — body, blade, road**
1. Sure Footing — +1 max HP per level already earned, capped at +20 (retroactive nudge).
2. Patience of Stone — +1 to all `defend` mitigation.
3. Long Wind — heal 1 extra HP per `rest`.
4. Iron Edge — +1 weapon damage on opening blow of a fight.
5. Mule's Back — +5 carry weight.
6. Second Strike — 10% chance any hit becomes a 2-hit flurry.
7. Wound-Reading — see exact NPC HP in combat (currently rough).
8. **Capstone — Last Breath:** the first killing blow per real day instead drops you to 1 HP and ends combat (one-shot anti-death).

**Whisper — silver, secrets, sleight**
1. Quick Tongue — +5% NPC starting amity on first meeting.
2. Light Fingers — +1 to steal d20 rolls.
3. Trader's Eye — see merchant base price beside their ask.
4. Coin-Purse — pickpocket gold rounds up; never returns 0 on success.
5. Ear to the Wall — gossip lines bleed amity 50% farther.
6. Quiet Step — fence rate 0.55 → 0.62.
7. Map-Sense — wagon fast-travel costs −20%.
8. **Capstone — Names in the Dark:** infamy decays 2× faster; one open bounty per real day quietly expires at dawn.

**Sigil — runes, kanji, the Speaker's grain**
1. Steady Hand — +5 to lesser-rune trace score.
2. Open Ear — first meaning of any new kanji is revealed for free.
3. Deep Memory — woven runes on items get +1 max charge.
4. Echo — 10% chance a successful lesser-rune cast doesn't consume its charge.
5. True Stroke — kanji backfire chance halved.
6. Four-Stroke — compound rune attempts get +1 component window.
7. Quiet Mouth — Speaker artifacts regain 1 charge per real day (max 1 above base).
8. **Capstone — The Unspoken:** unlocks a 4th Greater Rune slot in your spellbook (currently 3) and reveals one random undiscovered compound recipe.

### Gating
- Tier 2 needs 1 point in tier 1 of same branch.
- Tier 3 needs 2 points in tiers 1–2 of same branch.
- Tier 4 (capstone) needs 5 total points in that branch.
- No rebuild/respec — choices stick (matches the game's tone).

### Data model

New tables:
- `skill_nodes` (seeded, immutable): `key`, `branch` (steel/whisper/sigil), `tier` (1–4), `name`, `description`, `effect` (jsonb), `sort_order`.
- `player_skills`: `(user_id, node_key) PK`, `acquired_at`. RLS: own rows only readable; spend goes through edge function.

New profile column: `talent_points int default 0`.

`handle_profile_xp_change` trigger gains: when `level` increases, `talent_points := talent_points + (new_level - old_level)`. On first open of the modal (or via the spend function), back-fill so total points = `level − 1` (clamped, never reduced).

### Edge function
`spend-talent` — validates branch gating + point balance, inserts into `player_skills`, decrements `talent_points`. Single source of truth.

### Engine integration (light touches in existing code)
Read `player_skills` once on session start into a `skills: Set<string>` on the client and into edge functions as needed:
- `combat-action`: `iron_edge`, `second_strike`, `patience_stone`, `wound_reading`, `last_breath`.
- `rest-action`: `long_wind`.
- `steal-from-npc`: `light_fingers`, `coin_purse`.
- `npc-respond` / amity helpers: `quick_tongue`, `ear_wall`.
- `fence-item`: `quiet_step`.
- `wagon-travel`: `map_sense`.
- `lesser-rune-cast`: `steady_hand`, `echo`.
- `kanji-cast` / `kanji-practice`: `open_ear`, `true_stroke`, `four_stroke`.
- `artifact-action` / world-tick: `quiet_mouth`, `names_dark` (infamy decay).
- Inventory weight cap: `mules_back`.

### UI

New `SkillTreeModal.tsx` opened from Character Sheet ("Talents") and from a new pulsing badge on the HUD whenever `talent_points > 0`.

Layout: three vertical branches side by side, each a 4-tier ladder of node cards. Acquired nodes glow; locked nodes show their gating; available nodes have a "Take" button.

Aesthetic: muted parchment, branch tinted by color token (steel = ash blue, whisper = umber, sigil = ember). No flashy animations — tiny ink-bloom on acquire.

### Files

New:
- `supabase/migrations/<ts>_skill_tree.sql`
- `supabase/functions/spend-talent/index.ts`
- `src/components/mud/SkillTreeModal.tsx`
- `src/hooks/usePlayerSkills.ts`

Edited:
- `src/components/mud/GameClient.tsx` — load skills, talent-point HUD badge, modal mount, pass skills into client-side helpers.
- `src/components/mud/CharacterSheet.tsx` — Talents button.
- All edge functions listed above — read `player_skills` and apply the small numeric tweaks. Kept additive so removing a node never silently breaks a flow.

### Out of scope (this pass)
- Respec / refund.
- Class-specific trees.
- Cosmetic node unlocks.
- AI-narrated talent vignettes (could be a follow-up).