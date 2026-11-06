# AGENTS.md

Notes for AI agents (and humans) working in this repo. This file describes the **guild system**
in enough detail to rebuild it from scratch. Every number and rule below is taken from the code
named next to it. If the code and this file disagree, the code wins. Fix this file in the same change.

## TL;DR rule

- Guild rank math and board picks live in `supabase/functions/_shared/guildRanks.ts`. Edge functions
  and tests import it so thresholds stay in one place. **Do not copy the constants into other files.**
  (One existing copy in the frontend is a known exception; see "Known drift" below.)
- Dice, ability modifiers and checks live in `supabase/functions/_shared/dice.ts` (tests:
  `src/test/dice.test.ts`). Any new chance-based outcome should be a `check(...)` with an ability
  modifier, not a bare `Math.random()`. When converting an old probability `p`, use `dcForChance(p)`
  so a level-1 character with all scores at 10 keeps the old odds. The AI narrates outcomes; it
  never decides them. See README §4.
- NPC agents (`docs/npc-agents.md`): NPC behaviour logic lives in `_shared/npcMind.ts`, what a
  player may hear about an NPC in `_shared/npcVoice.ts`, and the Seven's decree rules in
  `_shared/decrees.ts`, all pure and tested. The AI never writes to the database directly. Gods
  return decrees that `validateDecrees` filters, and NPC wants become quests through fixed
  templates. Never put journal or player text into a prompt except through `quoteData`. Background
  AI calls go through `_shared/aiGateway.ts`.
- **Lore canon is the wiki in `everbloom-lore/`.** When code or data disagree with it, the wiki
  wins (ask the owner if the wiki contradicts itself). After editing wiki pages, run `npm run lore`
  to regenerate the codex migration (`drizzle/migrations/0009_lore_from_wiki.sql`). Never hand-edit
  that file. World summaries in AI prompts come from `_shared/worldCanon.ts`; god profiles from
  `AETHERS` in `_shared/decrees.ts`. `src/test/decrees.test.ts` and `src/test/lore.test.ts` check
  both against the wiki. Use the Latin spelling **Non Serviam**.
- Quest completion: `_shared/questRules.ts` (tested) decides who may complete a quest. Real item,
  room and NPC targets are checked by code (item in pack and handed over, arrival read from the
  server, kill recorded by `combat-action`). The NPC's `QUEST_RESOLVE` judges only quests with no
  real target. `quest-award` accepts only the service-role key; never call it with a player's token.
  NPCs may only offer items already in the `items` catalog.
- Room memory and cadence (`docs/room-scene.md`): rules live in `_shared/roomScene.ts` (tested). Code
  decides what happens in a room each pulse; the AI only writes the line. Room lines are saved to
  `messages`; lasting changes go in `room_scene.facts`, which expire.
- Wardens: an Aether lives while **any** of its 12 Wardens (people, items or places; `wardens` table)
  stands. Destruction goes through the `warden_destroyed` trigger, never by editing `aethers.alive`.

---

## 1. Where things live

| Concern | File |
|---|---|
| Rank names, XP thresholds, XP per quest, board-pick hashing, day/week keys | `supabase/functions/_shared/guildRanks.ts` |
| Guild UI actions (list board/stock, initiate, leave, accept quest, learn rune, buy item) | `supabase/functions/guild-action/index.ts` |
| Awarding guild XP and announcing rank-ups when a quest completes | `supabase/functions/quest-award/index.ts` (`completeQuest`) |
| Fence sales bump a `thieves` membership's `quests_completed` (no XP; see Known drift #3) | `supabase/functions/fence-item/index.ts` |
| Unit tests for rank thresholds | `src/test/guildRanks.test.ts` |
| Base schema and seed guilds | `supabase/migrations/20260509040734_2fb6adac-f735-472c-9e62-ff89713464be.sql` |
| `guild_xp` / `left_at` columns and XP backfill | `drizzle/migrations/0000_guild_halls_xp.sql` |
| Guild modal (board, stock, XP bar) | `src/components/mud/GuildModal.tsx` |
| Character-sheet guild summary | `src/components/mud/GuildBlock.tsx` |
| Generated DB types (shows the live columns) | `src/integrations/supabase/types.ts` |

Runtime: Supabase Edge Functions (Deno). `_shared/*.ts` must stay **dependency-free plain
TypeScript** so it can be imported by Deno (`"../_shared/guildRanks.ts"`, with the extension) and by
Vitest under Node (`"../../supabase/functions/_shared/guildRanks"`, without it).

---

## 2. `guildRanks.ts`: the shared module

### 2.1 Constants

```ts
GUILD_RANK_NAMES      = ["Initiate", "Journeyman", "Adept", "Master", "Grandmaster"]; // rank index 0..4
GUILD_XP_THRESHOLDS   = [0, 100, 300, 700, 1500];  // minimum guild XP for each rank index
GUILD_XP_PER_QUEST    = 50;                         // every completed non-initiation guild quest
GUILD_XP_WEEKLY_BONUS = 100;                        // extra for a "[Chapter Charge]" (weekly) quest
```

| Rank idx | Name | Min guild XP | Regular quests needed from 0 XP |
|---|---|---|---|
| 0 | Initiate | 0 | 0 |
| 1 | Journeyman | 100 | 2 |
| 2 | Adept | 300 | 6 |
| 3 | Master | 700 | 14 |
| 4 | Grandmaster | 1500 | 30 |

A Chapter Charge is worth 150 XP (50 + 100), the same as three regular quests.

### 2.2 `guildRankFor(xp: number): number`

Returns the **highest** index `i` with `xp >= GUILD_XP_THRESHOLDS[i]`. The scan is linear and assumes
the thresholds are ascending. Results: `0 → 0`, `99 → 0`, `100 → 1`, `300 → 2`, `700 → 3`,
`1500 → 4`, and anything above 1500 stays at 4. Negative XP returns 0.

### 2.3 Deterministic board picks

Every player in the same chapter must see the **same** daily and weekly quests, with no stored
state. Picks are therefore a pure function of `(seed, template ids)`.

```ts
// 32-bit FNV-1a over UTF-16 code units, returned as an unsigned 32-bit int.
function hash(s) {
  let h = 2166136261;                       // FNV offset basis
  for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } // FNV prime
  return h >>> 0;
}
boardPicks(tpls, seed, n) = [...tpls].sort((a, b) => hash(seed + a.id) - hash(seed + b.id)).slice(0, n);
dayKey(d = new Date())  = d.toISOString().slice(0, 10);                 // "YYYY-MM-DD", UTC
weekKey(d = new Date()) = "w" + Math.floor(d.getTime() / (7 * 86400000)); // weeks since Unix epoch
```

Properties to preserve when you reimplement it:
- `boardPicks` does not mutate its input. It only reads `.id`, so a list of `{id}` rows gives the
  same order as a list of full rows. `guild-action` relies on this (see §4.4).
- The day rolls over at **00:00 UTC**. The week rolls over every 7 days counted from the epoch.
  1970-01-01 was a Thursday, so **weeks start Thursday 00:00 UTC**, not Monday.
- The chapter seed prefix is `` `${guild_key}:${town_key}:` ``. Daily seed = prefix + `dayKey()`,
  weekly seed = prefix + `weekKey()`.
- Hash ties fall back to the original order (`Array.prototype.sort` is stable). Ties are practically
  impossible.

---

## 3. Data model (Postgres / Supabase)

Base schema: `supabase/migrations/20260509040734_...sql`. Additions: `drizzle/migrations/0000_guild_halls_xp.sql`.

```sql
guilds (key text PK, name, blurb, glyph default '✦', specialty)
  -- seeded: warriors "Warriors' Compact" ⚔, traders "Traders' League" ⚖, mages "Mages' Conclave" ✶

guild_chapters (guild_key, town_key, hall_room, guildmaster_npc_id uuid, flavor_blurb,
                PK (guild_key, town_key))           -- a chapter = one guild in one town

guild_stock (id uuid PK, guild_key, town_key,
             kind text,           -- 'lesser_rune' | 'kanji_rune' | 'item'
             ref_key text,        -- rune key or item key
             price_gold int default 0,
             rank_required int default 0,           -- 0..4
             blurb)

guild_quest_templates (id uuid PK, guild_key, town_key, rank_required int default 0,
                       title, objective, description,
                       target_kind default 'visit', target_ref,
                       reward_gold default 20, reward_xp default 30,
                       reward_item_key, reward_rune_key)

player_guild_membership (user_id, guild_key,
                         status text default 'prospect',   -- 'prospect' | 'initiating' | 'member'
                         rank int default 0,               -- 0..4, cached result of guildRankFor(guild_xp)
                         quests_completed int default 0,   -- informational only, NOT used for rank
                         initiation_quest_id uuid,
                         joined_at, updated_at,
                         guild_xp int NOT NULL default 0,  -- drizzle 0000
                         left_at timestamptz,              -- drizzle 0000
                         PK (user_id, guild_key))

quests  += source_guild text, source_guild_town text, is_initiation bool default false
npcs    += is_guildmaster bool default false, guild_key text, guild_town text
rooms   += guild_hall_access text                          -- drizzle 0000
```

RLS: the guild, chapter, stock and template tables are readable by any authenticated user. Each
player can SELECT only their own `player_guild_membership` rows. All writes go through edge
functions using the service-role client.

Backfill when `guild_xp` was introduced: `UPDATE player_guild_membership SET guild_xp = quests_completed * 50 WHERE guild_xp = 0;`

Naming convention: a guild hall's room slug is `` `${town_key}-${guild_key}-hall` ``. It is used for
the hall lookup and for rank-up announcements.

---

## 4. `guild-action` edge function

`POST` with a JSON body `{ action, guildmaster_id, ...extra }` and the user's `Authorization`
header. CORS preflight is handled. Errors come back as `{ error }` with status 400, 401, 404 or 500.

### 4.1 Preamble (runs before every action)

1. Authenticate the user with the anon client and the caller's JWT. Do every read and write with a
   service-role `admin` client.
2. Load the NPC by `guildmaster_id`. It must have `is_guildmaster`, `guild_key` and `guild_town`,
   otherwise `400 "not a guildmaster"`.
3. Load the chapter `(guild_key, guild_town)`, otherwise `404 "no chapter here"`. Load the `guilds` row.
4. Load the membership. If there isn't one, insert `status='prospect', rank=0, quests_completed=0`.
5. **Initiation auto-complete:** if `status='initiating'` and the initiation quest is not
   `complete`, `failed` or `abandoned`, mark it `complete` and log a `world_events` `quest_completed`.
   Talking to the guildmaster counts as returning to the hall. If the quest is (or now is) complete,
   set `status='member'` and `joined_at=now`.
6. **Lazy refresh:** count the player's `quests` with `status='complete'` and
   `source_guild=guild_key` into `qc`. Compute `newRank = status==='member' ? guildRankFor(guild_xp) : 0`.
   If `qc` or `newRank` changed, write `status, rank, quests_completed, joined_at, updated_at`.
   Non-members are always rank 0.
7. Load the profile (gold, room, username) and the known lesser and kanji runes.

### 4.2 `list`

Returns:
```jsonc
{ ok, guild, chapter, hall /* rooms row for `${town}-${guild}-hall` */,
  guildmaster: { id, name, title },
  membership: { status, rank, rank_name, quests_completed, guild_xp,
                rank_floor: THRESHOLDS[rank],
                next_threshold: THRESHOLDS[min(rank+1, 4)] },   // at rank 4 this equals rank_floor
  gold,
  stock: [ ...guild_stock row, display, owned, locked: rank_required > rank ],
  quests: [ ...weekly(0..1), ...daily(0..3) ],
  active_guild_quests: [ {title,status,id} with status in ('offered','active') for this chapter ] }
```
Stock `display`: the item name for items, `"<glyph> <latin_name> (<meaning>)"` for lesser runes, and
`"<kanji> <romaji> (<meaning>)"` for kanji. `owned` is true when the player already knows both halves
of a rune (`knows_word && knows_symbol`, or `knows_meaning && knows_stroke`).

**Board algorithm (copy it exactly):**
```
tpls       = templates for this chapter with rank_required <= playerRank
usedTitles = titles of the player's offered/active quests from this chapter, with any leading "[Chapter Charge] " removed
seed       = `${guild_key}:${town}:`
weekly     = boardPicks(tpls, seed + weekKey(), 1)                  // picked from ALL eligible tpls
             .map(t => ({...t, weekly:true, reward_gold: t.reward_gold*3, reward_xp: t.reward_xp*2}))
             .filter(t => !usedTitles.has(t.title) && isMember)
pool       = tpls.filter(t => !usedTitles.has(t.title) && isMember)
daily      = boardPicks(pool minus the weekly template's id, seed + dayKey(), 3)
quests     = [...weekly, ...daily]
```
Notes:
- The weekly pick runs **before** filtering, so it stays the same all week even after the player
  accepts it. It simply disappears from their board while it is active.
- The weekly candidate set depends on `playerRank`, so players of different ranks can see a
  different Chapter Charge. Players of the same rank in the same chapter see the same one.
- Prospects and initiates see an empty board.

### 4.3 `initiate`

- The player must be a `prospect`. Otherwise: `400 "you have already begun your initiation"`.
- **One guild at a time.** Any other membership with status `member` or `initiating` blocks this
  with `400 "you already belong to the <key>. Leave them first."`.
- **Rejoin grace:** if `left_at` is set and less than 7 days old, restore `status='member'` with
  `rank = guildRankFor(guild_xp)` and clear `left_at`. No initiation quest is created.
- If `left_at` is older than 7 days, reset `guild_xp = 0`, clear `left_at`, then continue as a new
  initiation.
- Insert an initiation quest. Shared fields: `kind:'favor', severity:'minor', status:'active',
  target_kind:'room', target_ref: chapter.hall_room, reward_gold 15, reward_xp 25, reward_amity 4,
  is_initiation:true, source_guild, source_guild_town`. Title and objective by guild:
  - warriors: `"An Oath in Steel — <hall_room>"`, "Walk a circuit of the streets and return to the Marshal."
  - traders: `"Mind the Ledger — <hall_room>"`, "Make one round of the streets and return to the Factor."
  - mages: `"Trace the First Stroke — <hall_room>"`, "Walk the chalk path and return to the Magister."
  - Any other `guild_key` has no entry here and will crash. Add one when you add a guild.
- Set the membership to `status='initiating', initiation_quest_id`. Log `world_events` `quest_accepted`.

### 4.4 `accept_quest` (`template_id`)

Checks, in order: must be a member, the template must exist and belong to this chapter, the player
must meet `rank_required`, and the player must have **fewer than 5** `active` quests in total
(across all sources).

Weekly detection runs the same pick again: `boardPicks(ids of eligible templates, seed + weekKey(), 1)[0].id === template_id`.

| Case | Title | Severity | Gold | XP |
|---|---|---|---|---|
| Weekly | `"[Chapter Charge] " + title` | `major` | ×3 | ×2 |
| `rank_required <= 0` | title | `minor` | ×1 | ×1 |
| `rank_required == 1` | title | `standard` | ×1 | ×1 |
| `rank_required >= 2` | title | `major` | ×1 | ×1 |

Every guild quest also gets `reward_amity 4`, the template's item and rune rewards,
`target_ref = tpl.target_ref ?? chapter.hall_room`, `source_guild` and `source_guild_town`.
Log `world_events` `quest_accepted`.

`quest-award` uses the `"[Chapter Charge]"` title prefix to detect the weekly XP bonus. Keep the
prefix byte-identical in both files.

### 4.5 `learn_rune` / `buy_item` (`stock_id`)

- The stock row must belong to this chapter. The player needs `rank_required <= rank` and enough
  gold. Non-members can only use rank-0 stock.
- `learn_rune` + `lesser_rune`: upsert `player_lesser_rune_knowledge` (word and symbol both true,
  `word_source:'guild'`), upsert `player_lesser_runes`, log `rune_word_learned`.
- `learn_rune` + `kanji_rune`: upsert `player_kanji_knowledge` (meaning and stroke both true,
  `meaning_source:'guild'`), log `kanji_meaning_learned`.
- `buy_item`: if the item is stackable and the player has an unequipped, uncontained stack, add 1
  (capped at `max_stack ?? 99`). Otherwise insert a new row with quantity 1.
- Then deduct `price_gold` from `profiles.gold` and return `{ ok, paid }`.

### 4.6 `leave`

Prospects get `400`. Everyone else is set to `status='prospect', rank=0, left_at=now`. **`guild_xp` is
kept**, so the XP survives a rejoin within 7 days (see §4.3).

---

## 5. Earning guild XP (`quest-award` → `completeQuest`)

After the normal rewards (clamped by `quest_reward_caps(severity)`), when a quest is marked complete:

```
if quest.source_guild && !quest.is_initiation:
    mem = membership(quest.user_id, quest.source_guild)
    if mem.status == 'member':
        gain = GUILD_XP_PER_QUEST + (title startsWith "[Chapter Charge]" ? GUILD_XP_WEEKLY_BONUS : 0)
        nx = mem.guild_xp + gain
        nr = guildRankFor(nx)
        update guild_xp = nx, rank = nr
        if nr > mem.rank and quest.source_guild_town:
            insert messages { room: `${town}-${guild}-hall`, user_id: null, author_name: "—",
                              kind: "system", content: `✦ ${username} is raised to ${RANK_NAMES[nr]} of the chapter.` }
```

- Initiation quests give **no** guild XP. They only make the player a member.
- Guild XP only goes up. It only resets when a player rejoins more than 7 days after leaving.
- Both `guild-action` (lazily) and `quest-award` (eagerly) write `rank`. Both derive it from
  `guildRankFor(guild_xp)`, so they cannot disagree as long as both import the shared module.

---

## 6. Frontend

- `GuildModal.tsx` calls `supabase.functions.invoke("guild-action", { body: { action, guildmaster_id, ... } })`.
  The XP bar is `(guild_xp - rank_floor) / max(1, next_threshold - rank_floor)`. The `max(1, …)`
  guards rank 4, where floor and next are equal. Weekly quests show an `[Chapter Charge]` tag.
- `GuildBlock.tsx` reads the player's `member` row directly from the table (RLS allows reading your
  own row) and draws the rank, XP and perks.

---

## 7. Changing the system: checklist

- **Thresholds or rank names:** edit `guildRanks.ts` only. Update `src/test/guildRanks.test.ts`
  and `GuildBlock.tsx` (see Known drift). Existing `rank` columns refresh lazily on the next
  `guild-action` call. Run a backfill if you need them updated right away.
- **More than 5 ranks:** `guild-action` hard-codes `Math.min(playerRank + 1, 4)`, and so does
  `GuildBlock.tsx`. Change both to `GUILD_XP_THRESHOLDS.length - 1`. Severity mapping (§4.4) and the
  SQL comment `0..4` also assume 5 ranks.
- **New guild:** seed `guilds`, `guild_chapters`, the guildmaster NPC (`is_guildmaster, guild_key,
  guild_town`), the hall room `<town>-<guild>-hall`, stock and templates. Also add an entry to the
  initiation map in §4.3.
- **Board size or multipliers:** they live inline in `guild-action` (`1` weekly, `3` daily,
  gold ×3, xp ×2). The XP bonus lives in `guildRanks.ts`.
- **Tests:** `npm test` (Vitest, `src/**/*.test.ts`, jsdom). Deno tests live in `supabase/functions/_tests/`.

---

## 8. Known drift / cleanup candidates

These are recorded here so they don't get copied. They are not fixed yet.

1. `src/components/mud/GuildBlock.tsx` keeps its own copy of `RANKS` and `XP`, which breaks the
   single-source rule. It could import from `@/../supabase/functions/_shared/guildRanks` the way the
   tests do. Until then, change both together.
2. The header comment in `guild-action/index.ts` says ranks are set "via guild quest count". That is
   stale. Rank comes from **guild XP**, and `quests_completed` is display-only.
3. **`thieves` is half-built.** `supabase/functions/fence-item/index.ts` upserts a
   `player_guild_membership` row with `guild_key='thieves'` and adds 1 to `quests_completed` on each
   fence sale. Its comment says this count is "used by guild rank thresholds", which is stale: it
   never touches `guild_xp`, so fencing never raises rank. `GuildBlock.tsx` lists a `thieves` perk,
   but there is no `guilds` seed, chapter, or initiation-map entry for thieves. Decide on a design
   before you extend it.
4. The `guild_xp` and `left_at` columns come from `drizzle/migrations/`, not `supabase/migrations/`.
   A rebuild that only applies `supabase/migrations` will be missing them.
5. `guildRankFor` is the only function with unit tests. `boardPicks`, `dayKey` and `weekKey` have
   none.
