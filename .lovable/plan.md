# Lifeskills, Gathering & Crafting

A parallel, non-combat progression track. Players gather resources from the world, level up lifeskills through use, and turn raw materials into food, potions, gear, and utility items at crafting stations.

## 1. The Six Lifeskills

Each has its own XP pool, level (1–50), and a small perk every 5 levels (yield chance, quality bonus, rare-find odds). All progress via a shared `player_lifeskills` table — no talent-point cost, no competition with combat skills.

- **Foraging** — herbs, mushrooms, fibers (wilds, desert oases, forests)
- **Mining** — ore, gems, salt (mountain, cave, ruin rooms)
- **Fishing** — river/lake/coast rooms; requires a rod
- **Cooking** — food that grants short buffs and heals over rest
- **Alchemy** — potions (heal, cure, cleanse, temp buffs) and reagents
- **Smithing** — weapons, armor, tools; can improve existing gear (+1 lines)

(Runewright/inscription already exists as a Sigil path — we deliberately don't duplicate it here.)

## 2. Gathering in the World

Rooms get **resource nodes** based on their environment. Nodes are shared, respawn on a timer, and yield randomized loot scaled to the player's skill level.

- New table `resource_nodes` (per-room type, current stock, respawn_at).
- Seed nodes from `rooms.kind` + `room_env_tags`: e.g. `wilds → herbs + wood`, `mountain → ore`, `coast/river → fish`.
- New button in the room panel: **Gather** — appears only when a node is present and matches a skill the player has (Foraging/Mining/Fishing).
- Edge function `gather-node`: rolls yield vs skill level, deposits items, grants XP, marks node depleted for N minutes. Fishing requires an equipped rod; Mining requires a pick.
- World-tick refreshes depleted nodes.

## 3. Crafting Stations & Recipes

Stations are just NPCs or fixtures already in town rooms — no map changes needed. Interacting with one opens a **Craft** modal.

- `crafting_stations` (station_key, room_slug, kind: kitchen | alchemy_bench | forge | tanning_rack).
- `recipes` (key, skill, level_req, station_kind, inputs jsonb, output_item, output_qty, xp_reward).
- Player recipe unlocks: `player_recipes` (learned via level-ups, buying scrolls from merchants, quest rewards, or discovery by trying combinations at a station).
- Edge function `craft-item`: validates station proximity, level, inputs; consumes materials; rolls quality (crit on high skill grants a `+quality` item variant); grants XP.

Starter recipe set (~40 total for launch): 8 cooking, 8 alchemy, 8 smithing weapons, 8 smithing armor, 8 misc (tools, dyes, bait).

## 4. Items & Materials

- Expand `items` with new slots already used elsewhere (`material`, `tool`, `food`, `potion`). Materials stack; tools are equippable in `main_hand`/`off_hand`.
- Seed ~60 new materials (herbs, ores, gems already partially exist — extend without duplicates), 10 tools (fishing rod, pickaxe, kitchen knife, alchemy kit, smithing hammer, tongs, etc.), starter foods/potions.
- Food grants short "well-fed" buffs stored in a new `player_buffs` table (name, expires_at, effect_json). Combat/rest checks read active buffs.

## 5. UI

- **Lifeskills panel** in the character sheet: 6 skill bars with level, XP, next perk, recent unlocks.
- **Gather** button on the room card when a node is present.
- **Craft** modal at stations: recipe list (locked/unlocked/level-gated), ingredient checklist, quality preview, craft-N slider.
- **Buffs strip** on the HUD showing active food/potion buffs with countdowns.

## 6. Economy Hooks (light-touch)

- Merchants in each capital stock 1–2 starter recipe scrolls for their specialty (Bastion = smithing, Bazaar = alchemy, Horizon = cooking, etc.).
- Crafted goods can be sold through the existing mercantile system; high-quality items fetch more.
- No new currency, no auction house.

## Technical

- Migrations: `player_lifeskills`, `resource_nodes`, `crafting_stations`, `recipes`, `player_recipes`, `player_buffs`, extend `items.slot` check trigger. All get GRANTs + RLS (reads for authenticated where scoped by `user_id`; service-only writes via edge functions).
- Edge functions: `gather-node`, `craft-item`, `learn-recipe`, `consume-buff`. All validate room, tool, level, and inputs server-side.
- `world-tick` extended to respawn nodes and expire buffs.
- No changes to combat balance beyond buffs reading from `player_buffs`.
- Seed data lives in a single SQL file so it can be tuned without code changes.

## Out of scope

- Player-owned housing / workshops.
- Multi-player co-op crafting.
- Rare "master" recipes gated behind Aether or awakening (can layer in later).
- Rebalancing existing items to fit tiered materials.

## Rollout

Suggest three PRs matching sections 2, 3, 5 — but I can ship it all in one pass. Say the word.
