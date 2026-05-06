# World Expansion: Cities, Roads, Wilds & the Buried City

## Goals

1. **20+ rooms per city** (First City + all 7 Aether capitals).
2. **Travel space between cities** — capitals no longer share an edge with the First City Gate; you walk roads/passes to reach them.
3. **Fast-travel Wagon Service** — NPCs at hubs who, for gold, teleport you to another hub you've visited.
4. **Wilderness & Desert** built out with hidden treasures and **Tomb-Below**, a buried city of the dead.

---

## 1. City Expansions (≥20 rooms each)

Each capital currently has ~7 rooms (capital + 6 sub-rooms). I'll add ~14 more themed sub-rooms per city, branching 2–3 deep so the city feels like a place you can get lost in. New rooms are themed to each Aether's domain/sin/virtue.

Examples (full list goes into the migration):

- **First City** (~8 → 22): add Veiled Cloister, Pilgrim Steps, Lantern Bridge, Sigil Smithy, Refugee Tier, Breadline, Underbazaar, Cistern Walk, Bell-Tower of Seven, Hospice of the Mute, Chapel of the Unspoken, Foreigners' Tier, Watchwall North/South, Dock of Lost Names, etc.
- **High Sanctum / Solastin** (Light, pride): Penitents' Stair, Hall of Lit Names, Reliquary of Suns, Tribunal Antechamber, Gilded Choir, Solar Forge, Confessor's Cell, Pyre Court, Almsgate, Reading Loft, Mirror Walk, Acolyte Dorms, Scribes' Tier, Censer Garden.
- **Iron Bastion / Khalvaris** (Justice, wrath): Gauntlet, Slag Pits, Verdict Steps, Drillyard, Black Anvil, Iron Library, Wardens' Mess, Quenching Pool, Banner Hall, Dueling Pit, Helm Walk, Foundry Stair, Smoke Roost, Veterans' Tier.
- **Mirrorlands Court / Nyxara** (Identity, envy): Hall of Worn Faces, Two-Names Court, Veil Atelier, Whisper Maze, Pool of Other Lives, Wax Theatre, Naming Garden, Lost-Self Cells, Quiet Mirror, Borrowed Wardrobe, Reflection Stair, Mask Vault, Tutor's Loft, Empty Frame.
- **Gilded Bazaar / Thalvora** (Wealth, greed): Bonded Vaults, Tithe Steps, Slave-Debt Pen, Auction Tier, Coin-Press, Spice Row, Caravan Yard, Beggars' Stair, Ledger Hall, Pawn Crypt, Silver Garden, Brokers' Loft, Smuggler's Cellar, Customs Walk.
- **Silent Horizon / Lazareth** (Knowledge, sloth): Folio Stacks, Glyph Hall, Translators' Cells, Hush Stair, Map Vault, Telescope Walk, Forbidden Tier, Sleepers' Long-Beds, Indexers' Hall, Annex of Errors, Drowsy Garden, Ink-Dark Pool, Apprentices' Loft, Footnote Crypt.
- **Evershade Court / Velithria** (Devotion, lust): Vow Walk, Veil Garden, Mourners' Tier, Singers' Hollow, Chamber of One Name, Memory Pool, Kept-Promises Hall, Hush Stair, Locket Vault, Bridal Loft, Tear-Glass Window, Confessional Booths, Empty Bed, Ribbon Crypt.
- **Feastlands Keep / Morvayne** (Plenty, gluttony): Long Tables, Spit-Yard, Brewing Cellar, Cull Pens, Granary Stair, Honey Loft, Smokehouse Row, Salt Vault, Bone-Soup Kitchen, Vine Garden, Fat Furnace, Drunkards' Tier, Hunting Lodge, Famine Door (locked).

---

## 2. Travel Corridors Between Cities

Remove the direct exits from `first-city-gate` to each capital. Insert a **road of 22–333 rooms** before each city. Roads have low NPC density, occasional ambushes, ambient encounters randomly generated with bandits, orcs, undead rarely and so on.

```text
First City Gate
   ├── pilgrim-causeway → solar-foothills → high-sanctum
   ├── ironroad → slag-flats → iron-bastion
   ├── hall-of-mirrors-pass → glassmere → mirrorlands-court
   ├── caravan-spur → goldwash → gilded-bazaar
   ├── star-stairs → hush-pines → silent-horizon
   ├── vow-walk → silver-pines → evershade-court
   └── hearth-road → barley-flats → feastlands-keep
```

Each road room: kind=`road`, density 0–2 NPCs, scenic description, occasional `world_event`-driven encounter (already supported).

---

## 3. Fast-Travel Wagon Service

A new NPC role: **Wagonmaster**. Placed at each city gate + the First City Gate.

- New table `wagon_routes` (slug pairs + cost + flavor) OR simpler: hard-coded in a new edge function `wagon-travel`.
- Player must have **previously visited** the destination (track via `world_events` of kind `discovered_room`).
- Cost scales by distance (e.g. 5–25 gold).
- Calling the function: deducts gold, updates `profiles.current_room`, posts a flavorful arrival message ("*The wagon shudders to a halt at the gates of …*").
- UI: new **"Hire wagon"** button visible in any room with a Wagonmaster NPC; opens a small dialog listing visited destinations + costs.

---

## 4. Wilderness & Desert Buildout

### Wilderness (north of First City via `old-flag-road`)

Expand `wilderness-edge` and `deep-wilds` into a network of ~10 rooms:

- Briar Hollow, Standing Stones, Wolf-Glade, Drowned Chapel, Hermit's Hut, Moss Bridge, Witch-Tree, Cairn Field, Foxhole Pit, Black Tarn.
- Hidden treasures: 3–5 rooms have a one-time discoverable cache (gold + item) tied to a `room_caches` table, claimed per-user.

### Desert (south via `caravan-road`)

Expand into ~10 rooms:

- Glass Flats, Salt Mirror, Sun-Bleached Caravan, Vulture Spire, Mirage Wells, Ember Dunes, Whisper Stones, Forgotten Oasis, Skeleton Kiln, Wind-Carved Arches.
- Hidden caches as above.

### The Tomb-Below (buried city of the dead)

A multi-room sub-zone reachable from one specific desert room (`skeleton-kiln`) via a `down` exit unlocked when the player digs/searches there. ~10 rooms:

- Sunken Gate, Hall of Folded Names, Long Crypts, Coin-Choked River, Silent Market (mirror of the Bazaar), Throne of Dust, Chorus of Bones, Reliquary of the First Voice, Drowned Library, Tomb-Heart.
- Higher-tier treasures, undead encounters, a major lore drop ("the Speaker's first city, buried before the Aethers rose").

---

## Technical Plan

### Migrations

1. Insert ~100 new rooms across the categories above (single SQL migration, idempotent via `ON CONFLICT (slug) DO NOTHING`).
2. Update existing capitals' `exits` to point to road rooms instead of `first-city-gate` directly.
3. Update `first-city-gate`'s `exits` to the road heads.
4. Create `room_caches` table:
  ```sql
   create table room_caches (
     room text primary key,
     gold int default 0,
     item_key text,
     hint text
   );
   create table player_room_cache_claims (
     user_id uuid, room text, claimed_at timestamptz default now(),
     primary key (user_id, room)
   );
   -- RLS: own claims readable/insertable by user
  ```
5. Seed `room_caches` for the ~10 hidden-treasure rooms.

### Edge Functions

- `**wagon-travel**`: input `{destination_slug}`. Verifies caller is in a wagon-hub room, has visited the destination (from `world_events`/`discovered_room`), can pay the gold. Updates `profiles.current_room`, logs a `world_event`, posts arrival message.
- `**search-cache**` (or extend `interact`): when player runs "search" or "dig" in a `room_caches` room and hasn't claimed it yet, awards loot + records claim.

### Client (`GameClient.tsx`)

- Add a **"Hire Wagon"** button when a Wagonmaster NPC is in the current room (detect by `npcs.title` starting with `Wagonmaster`).
- Dialog lists visited destinations + costs; calls `wagon-travel`.
- Add a **"Search"** affordance in rooms with `kind` in (`wilds`,`desert`,`crypt`,`ruin`,`cave`) that calls the cache function.

### Memory updates

- Update `mem://lore/crescent-kingdoms` with the expanded sub-room hierarchy.
- Update `mem://lore/wilderness` and `mem://lore/desert` with the new locations + Tomb-Below.
- Add new memory `mem://features/fast-travel` describing wagon mechanics.

---

## Out of scope for this pass

- Random-encounter combat on roads (we'll rely on existing ambient/world-tick systems for now).
- Procedural loot tables for caches (using fixed seeded loot per room).
- New NPC art/portraits for wagonmasters (they use generic).

Approve and I'll execute the migration + edge functions + UI in one pass.