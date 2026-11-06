# EverBloom: a living text world of silent gods

> First there was the Light. Then the **Speaker** opened its mouth, and the **Aethers** poured forth:
> every spoken thing. But some things are not spoken into being. For every light there is a
> **Shadow**, and the Shadow was already waiting.
> Now the Speaker has withdrawn into silence. The maps are eaten and the cities forget their names. Yet a single
> pool still blooms in the deep desert, and it is asking who you mean to be.

EverBloom (repo: `storyweaver-ai-mud`) is a **persistent, multiplayer, browser-based MUD**. AI writes
the voices of the world: NPCs, scenes, ambience, portraits and music. **Code owns the rules.** Players
share rooms, see each other's actions in real time, earn standing with factions and guilds, trace
runes by hand to cast them, and leave marks on a world that keeps moving while they are away.

*Landing-page tagline: Multiplayer · AI souls · Rune-weaving · Turn-based combat · Persistent world.*

---

## 1. Vision

> The vision below is inferred from what the code does today. The project owner should correct it
> wherever it differs from their intent.

1. **A world that remembers.** NPCs keep memories and an amity score (-100 to +100) for each player
   and pass gossip about players to each other. World events are logged and decay over time. An
   hourly world tick moves NPCs along their schedules even when no one is watching.
2. **AI narrates; code decides.** The AI never decides an outcome on its own. Rewards are clamped to
   severity bands on the server. Quests, prices and offers only count when the AI emits a structured
   tag (`<<QUEST_OFFER>>`, `<<PRICE_OFFER>>`, `<<ITEM_OFFER>>`, `<<AMITY>>`) that the server then
   validates. Chance events are settled by **dice rolls plus the character's ability modifiers**
   (§4). The AI is told the result and narrates it.
3. **Choice with weight.** Every walker comes to the Hall of Seven Ways and must choose. They can
   swear to one of the seven Aethers and walk its seven-step vow chain. They can refuse, which builds
   chaos pressure and lets the Shadow's whispers in. Or they can declare **Non Serviam** and walk the
   Chaos path. These choices are one-way and the whole world reacts to them.
4. **Knowledge is power, earned by hand.** Magic is language. Lesser runes are Latin words with drawn
   symbols. Kanji runes are learned stroke by stroke and combined into compounds. You cast by
   **tracing the glyph**, and the server checks the shape again so the client can't cheat.
5. **Small, human-scale stakes.** You start in plain clothes with nothing. Gold, gear, guild rank,
   companions and reputation are earned. Death is real: you can be downed, killed, revived as a
   zombie, or start over.
6. **Atmosphere first.** Every room can have generated scene art, music and ambient sound, all
   cached. Portraits change with your wounds and your gear.

---

## 2. The world

**Canon lives in the wiki: [`everbloom-lore/`](everbloom-lore/).** When the wiki and the code
disagree, the wiki wins. The game's codex is generated from it (`npm run lore`), and tests fail when
code, data and wiki drift apart.

- **The Speaker:** spoke the world out of the Light, then **withdrew into silence** so its people
  could choose freely ("What will you become, when you are free to choose?"). Its echoes remain as
  Relics.
- **The seven Aethers:** each a Virtue bound to a Sin, each ruling one of the seven **Crescent
  Kingdoms**. Their own subjects (NPCs) live under them. Otherworlders (players) are free: an Aether
  can only nudge them.

  | Aether | Virtue / Sin | Governs | Kingdom (capital) |
  |---|---|---|---|
  | Khalvaris, the Judge | Patience / Wrath | War and Law | the Iron Bastion |
  | Solastin, the Architect | Humility / Pride | Civilization and Leadership | the High Sanctum |
  | Nyxara, the Muse | Kindness / Envy | Ambition and Transformation | the Mirrorlands (Mirrorlands Court) |
  | Velithria, the Lover | Chastity / Lust | Passion and Discipline | the Evershade (Evershade Court) |
  | Thalvora, the Merchant | Charity / Greed | Exchange and Value | the Gilded Bazaar |
  | Lazareth, the Archivist | Diligence / Sloth | Time and Knowledge | the Silent Horizon |
  | Morvayne, the Harvester | Temperance / Gluttony | Nature and Consumption | the Feastlands (Feastlands Keep) |

  Players swear to one in **the Hall of Seven Ways**. Each Aether has a throne room, a city "well
  room" (where its sworn are carried home at death: Borrowed Immortality), a seven-step vow chain,
  and **twelve Wardens** (people, relics and sacred places). **An Aether lives while any of its
  Wardens stands.**
- **The Veiled:** the mouth-bound Followers of the Speaker. They maintain (not rule) **the First
  City**, the neutral convergence point where no Aether holds dominion, and welcome Otherworlders at
  the Gate of Form.
- **Chaos / the Shadow:** Chaos (the Unbound) is the refusal of all alignment; its whisper is the
  Shadow. It tempts players, raises corruption, and backs the **Non Serviam** path. When corruption
  reaches 70 or more, it shows to every NPC. (Canon: Chaos players die permanently. Not yet enforced.)
- **Dragons** wake where gold lies hoarded. The age is the Quiet Rot: stable but stagnant.
- **The EverBloom:** the last blooming pool in the deep desert, where players are "bloomed" into the
  world.
- **Regions:** towns and their halls, roads, wilds, groves, shores, bridges, crypts, and the deep
  desert (an off-road wander system where you can lose your bearing).
- **Lore:** `lore_entries` is synced from the WorldForge Collective site (`sync-lore`). Players
  discover entries when narration mentions their keywords.

Six playable races: Human, Elf, Dwarf, Half-Giant, Beastman and Sandborn. Twelve classes: Warrior,
Mage, Monk, Paladin, Ranger, Rogue, Summoner, Gambler, Bard, Alchemist, Necromancer and Runewright.
Each class gets a talent tree and an Awakening at level 15.

---

## 3. A walker's journey

1. **Landing → Intro:** a narrated intro with generated music and voice (`intro-music`, `intro-narration`).
2. **Character creation:** choose a name, race, class and a short self-description. The AI paints a
   humble starting portrait. HP comes from race and class modifiers. **Ability scores** are 10 plus
   race and class modifiers (§4). You also get the class starting kit (`create-character`).
3. **Onboarding:** a shore guide teaches the basics (`onboarding-tick`).
4. **The Hall of Seven Ways:** swear to an Aether (`align-aether`), walk out and refuse
   (`refuse-aethers`), or later declare Non Serviam (`declare-non-serviam`).
5. **The open world:** talk to AI NPCs, take and finish quests, join a guild, trade, craft, gather,
   travel by wagon, wander the desert, fight, rest, and level up.

---

## 4. Dice and ability scores

Chance events are settled by **dice rolls plus modifiers**, not by bare random numbers. All the math
lives in **`supabase/functions/_shared/dice.ts`**, which the edge functions and the tests import.
Don't copy it anywhere else.

### Ability scores
Each character has `str`, `dex`, `con`, `int`, `wis` and `cha` columns on `profiles`.
Starting score = **10 + race mod + class mod**. The mods are stored as jsonb in
`races.ability_mods` and `class_defs.ability_mods`.

| Race | Mods (each race nets +2) | Class | Mods (+2 primary, +1 secondary) |
|---|---|---|---|
| Human | WIS+1 CHA+1 | Warrior | STR+2 CON+1 |
| Elf | DEX+2 WIS+1 CON-1 | Mage / Necromancer / Runewright | INT+2 WIS+1 |
| Dwarf | CON+2 STR+1 CHA-1 | Monk / Ranger | DEX+2 WIS+1 |
| Half-Giant | STR+3 CON+1 DEX-1 CHA-1 | Paladin | STR+2 CHA+1 |
| Beastman | WIS+2 DEX+1 CHA-1 | Rogue | DEX+2 INT+1 |
| Sandborn | CON+1 DEX+1 WIS+1 INT-1 | Summoner | CHA+2 INT+1 |
| | | Gambler / Bard | CHA+2 DEX+1 |
| | | Alchemist | INT+2 CON+1 |

### The check
```
ability modifier = floor((score - 10) / 2)        // 10 → +0, 14 → +2, 9 → -1
level bonus      = floor((level - 1) / 4)         // +0 at levels 1-4, +1 at 5-8, ...
check            = d20 + ability modifier + level bonus (+ situational)  vs  DC
success          = total >= DC                    // no auto-pass or auto-fail on a natural 20 or 1
```
A natural max or a natural 1 is flagged as a critical success or critical failure. This only affects
how the result is narrated. It never changes the odds.

**Baseline rule:** checks that replaced an old `Math.random() < p` use `dcForChance(p)`. That gives
a **level-1 character with all scores at 10 exactly the old odds** (or within 2.5% where a d20 step
forces rounding). Better scores and higher levels improve the odds from there.

| Event | Function | Roll |
|---|---|---|
| Pickpocket an NPC | `steal-from-npc` | d20 + DEX + level vs 10 (+4 merchant, +5 warden, +3 guildmaster, +12 Aether) |
| Search a room for a cache | `search-cache` | **d12** + WIS + level vs the cache's `find_dc` |
| Keep your bearing off-road in the desert | `desert-wander` | d20 + WIS + level vs `dcForChance(1 - lostChance)` |
| Wake before a camp ambush | `rest-action` | d20 + WIS + level vs `dcForChance(0.65)` (DC 8) |
| Extra pull when gathering | `gather-node` | d20 + skill ability vs DC 11 |
| Fine-quality crafting crit | `craft-item` | **d100** + 5 × skill ability vs `dcForChance(min(50%, skill level %), 100)` |
| Effortful free-form actions (push, climb, pick, listen, sing…) | `interact` | d20 + ability + level vs DC 12. The AI narrates the outcome it's given. |
| Persuading, haggling, intimidating or charming an NPC | `npc-respond` | A hidden d20 + CHA + level vs DC 12 every time the player speaks. The NPC applies it only when the player is trying to sway them. |

Ability used by each life skill: foraging WIS, mining STR, fishing DEX, cooking WIS, alchemy INT,
smithing STR. Ability used by each `interact` verb: see `INTERACT_VERB_ABILITY` in `dice.ts`. Verbs
that aren't listed (look, smell, read, sit…) just happen, with no roll.

Rolls are shown in chat, e.g. `rolled 14+2=16 vs 12`. Combat (`combat-action`) still uses its own
random ranges. Moving it onto this system is planned as a separate pass.

---

## 5. Systems at a glance

| Area | What it does | Edge functions |
|---|---|---|
| Talking to NPCs | Persona-driven AI replies with memory, amity, gossip, quest and price offers, services | `npc-respond`, `npc-service`, `hire-companion` |
| Quests | NPC-offered quests, guild quests, riddles, chains | `quest-action`, `quest-award`, `quest-auto-resolve`, `riddle-offer`, `riddle-solve`, `lichen-king-action` |
| Guilds | Warriors, Traders and Mages chapters in each town. Five ranks from guild XP, daily and weekly boards. See `AGENTS.md`. | `guild-action` |
| Factions and faith | Aether oaths and vow chains, the Chaos path, Shadow temptation, corruption | `align-aether`, `aether-loyalty-action`, `refuse-aethers`, `declare-non-serviam`, `chaos-path-action`, `shadow-tempt`, `mirror-greet` |
| Magic | Lesser runes (Latin), kanji runes and compounds, traced by hand with a $1 unistroke recognizer | `lesser-rune-cast`, `kanji-practice`, `kanji-cast`, `rune-action` |
| Combat | Turn-based combat with initiative, rune casting mid-fight, bosses, dragons, downed/dead/revive | `combat-action`, `random-encounter`, `dragon-check`, `resurrect-bosses`, `revive-player` |
| Economy | Markets with live prices and town tariffs, bank and town board, fences for stolen goods | `market-action`, `town-board`, `fence-item`, `steal-from-npc` |
| Life skills | Gathering nodes, recipes, crafting stations, quality crits | `gather-node`, `learn-recipe`, `craft-item` |
| Exploration | Map discovery, wagon travel, desert wandering, caches, loot, free-form interactions | `discover-location`, `wagon-travel`, `desert-wander`, `search-cache`, `take-loot`, `interact` |
| Character | Creation, talents, awakenings, inventory, rest, rename, restart | `create-character`, `spend-talent`, `awaken-class`, `inventory-action`, `rest-action`, `rename-character`, `restart-character` |
| Living world | Hourly NPC schedules, room population, ambience | `world-tick`, `populate-npcs`, `room-ambience` |
| NPC agents | Role NPCs live by needs (coin, hunger, rest, safety, belonging, faith). Their wants become board quests or letters to trusted players. Players learn their inner lives through amity. See `docs/npc-agents.md`. | `npc-agent-tick`, `npc-respond` |
| The Seven | Each living Aether rules its kingdom, waking in turn to issue decrees (goals, laws, rumors, festivals, summons, bonds) | `seven-tick` |
| Art and sound | Scene art, portrait wound and gear variants, room music and ambience, bardic performance | `scene-image`, `portrait-state-variant`, `restyle-portrait`, `scene-music`, `room-audio-generate`, `music-action`, `intro-music`, `intro-narration` |
| Ops | Lore sync, admin wipe | `sync-lore`, `admin-wipe` |

---

## 6. Architecture

```
Browser (React 18 + Vite + TypeScript + Tailwind + shadcn/ui)
  │  supabase-js: auth, table reads (RLS), realtime messages, functions.invoke(...)
  ▼
Supabase
  ├─ Postgres: world, players, NPCs, quests, items, messages, world_events (RLS on)
  ├─ Edge Functions (Deno): every state-changing action is server-authoritative
  │     └─ supabase/functions/_shared/*.ts: pure shared logic (dice, guild ranks, shop tiers)
  └─ Storage: portraits, scene art, music buckets (cached generations)
        ▲
        └─ External: Lovable AI Gateway (Gemini text and image models), ElevenLabs (music/ambience/voice)
```

Principles to keep:
- **Server-authoritative.** The client asks; edge functions check and write using the service-role
  key. Players can read only what RLS allows.
- **Shared pure logic.** Rules that the server, UI and tests all need go in
  `supabase/functions/_shared/` as dependency-free TypeScript. Deno imports it with a `.ts`
  extension. Vitest imports it without one.
- **AI output is untrusted.** Parse the structured tags, clamp the numbers, and ignore anything else.
- **Cache generated media.** Key it by content so the same scene doesn't cost twice.

### Repo layout
```
src/
  components/mud/        Game UI: GameClient (command parser + main loop), modals, panels, tracers
  components/ui/         shadcn/ui primitives
  integrations/supabase/ client + generated DB types
  test/                  Vitest unit tests (dice, guild ranks, shop tiers, map layout, world time…)
supabase/
  functions/<name>/      one edge function per folder
  functions/_shared/     shared pure modules (dice.ts, guildRanks.ts, shopTiers.ts)
  migrations/            original Lovable/Supabase SQL migrations (timestamped)
drizzle/migrations/      newer SQL migrations (0000_…, 0001_…, 0002_ability_scores …)
AGENTS.md                deep-dive notes for AI agents (guild system)
```

Migrations live in **two places**. The newer ones are in `drizzle/migrations/`. A fresh database
needs `supabase/migrations` first and then `drizzle/migrations` in order.

---

## 7. Running it

```sh
npm install
npm run dev       # Vite dev server
npm test          # Vitest unit tests
npm run lint
```

Frontend `.env`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`.

Edge function secrets: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`LOVABLE_API_KEY` (AI text and images), `ELEVENLABS_API_KEY` (music and audio).

The project is also editable through Lovable, which commits back to this repo.

---

## 8. Known gaps / next steps

- Combat still uses ad-hoc random ranges. The next step is d20 attack rolls against defense, damage
  dice and ability-based initiative, all through `dice.ts`.
- The character sheet doesn't show ability scores yet. `src/integrations/supabase/types.ts` hasn't
  been regenerated for the new columns.
- Ability scores are fixed after creation. There's no way to raise them yet (level-ups, talents,
  gear, Aether boons).
- Some race "gain" texts promise perks that are only partly implemented. For example, the elf's
  "+1 to discovery" now comes from WIS through the search check.
- Guild-system drift is listed in `AGENTS.md` §8.
- NPC agents and the Seven: phases 1–4 are built. What's still missing is listed in `docs/npc-agents.md` §9.
