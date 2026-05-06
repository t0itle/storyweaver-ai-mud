## Quest System

NPCs offer quests organically through conversation. Quests scale in severity, with rewards tuned to match. Players accept, track, and turn in quests by talking to the giver.

### 1. Data model (one migration)

**`quests` table:**
- `id`, `giver_npc_id`, `user_id`, `title`, `description`, `objective` (short text the AI uses to judge completion), `status` (`offered|active|complete|failed|declined|abandoned`)
- `severity` — `trivial | minor | standard | major | legendary`
- `kind` — `fetch | deliver | slay | visit | talk | favor` (favor = freeform AI-judged)
- `target_kind`, `target_ref` — e.g. `room:archive-of-echoes`, `npc:<id>`, `item:bronze-key`
- Rewards: `reward_gold int`, `reward_xp int`, `reward_amity int`, `reward_item_key text`, `reward_rune_key text`, `reward_kanji_key text`
- `accepted_at`, `completed_at`, `created_at`, `expires_at` (nullable — some quests rot)

RLS: players read/update their own quests; service role manages awards. Index on `(user_id, status)`.

**Severity → reward bands** (server-side caps so the AI can't overpay):

```text
trivial    : 1-5g    | 5-15xp  | +1-3 amity  | no item
minor      : 5-20g   | 15-40xp | +3-6 amity  | maybe consumable
standard   : 20-60g  | 40-100xp| +5-10 amity | uncommon item OR rune word
major      : 60-200g | 100-250xp | +10-20 amity | rare item AND knowledge
legendary  : 200-600g| 250-600xp | +20-40 amity | unique item + rune/kanji
```

A `clamp_reward()` helper enforces these on every insert/award.

### 2. NPC offers a quest (in `npc-respond`)

Add a fourth hidden tag the NPC may emit:

```
<<QUEST_OFFER>>{"title":"...","description":"...","objective":"...","kind":"fetch","severity":"minor","target_kind":"item","target_ref":"silver-locket","rewards":{"gold":15,"xp":25,"amity":4}}<<END>>
```

Prompt rules:
- Only offer when the conversation naturally produces a need.
- Severity must match what the NPC actually wants (a tavern fetch ≠ legendary).
- Rewards must fall in the band for that severity (server clamps anyway).
- One offer per reply, max. If an active quest with this player already exists, do NOT offer another.

The function inserts the row with `status='offered'`, returns it in the response, and the client shows an inline Accept / Decline UI.

### 3. Tracking active quests

Active quests are passed into the NPC's context block on every later conversation:

```
ACTIVE QUEST WITH YOU: "<title>" — <objective> (<status>)
```

This lets the giver react ("any luck with the locket?") and lets bystanders ignore it (only the giver sees it).

### 4. Completion

Two paths, both server-authoritative:

**Auto-complete** (no AI needed):
- `visit` — checked in `moveTo`: if any active quest of kind=visit and target_ref=slug, mark complete.
- `slay` — checked when `npc_killed` world_event fires (extend existing trigger or do it in the combat resolver).
- `fetch` — checked when player picks up the item (extend `inventory-action`).

**AI-judged** (`favor`, `talk`, ambiguous):
- When player talks to the giver with an active quest, the NPC may emit `<<QUEST_RESOLVE>>{"quest_id":"<id>","outcome":"complete|fail|in_progress","note":"..."}<<END>>`.
- Server validates the quest belongs to this NPC and player before awarding.

On `complete`: a new `award-quest` edge function (or inline in the resolver) applies clamped rewards, bumps `npc_amity`, inserts learned rune/kanji knowledge, grants the item via `player_items`, logs a `world_event` `quest_completed`, and writes a journal entry through the existing trigger.

### 5. Player commands & UI

Commands in `GameClient.tsx`:
- `quests` — list active + offered with title, giver, objective, status
- `accept <id|title>` / `decline <id|title>` — only valid for offers
- `abandon <id|title>` — drops an active quest, small amity penalty with the giver

UI:
- New "Quests" button in the HUD opens a `QuestsPanel` modal listing offered/active/recent.
- When an NPC reply contains a fresh offer, render an inline Accept/Decline pair under the message.
- Toast on completion ("✦ Quest complete: The Locket of Renn — +15g, +25xp").

### 6. Journal hook

Extend `write_journal_from_world_event` with cases for `quest_accepted`, `quest_completed`, `quest_failed`, `quest_abandoned` so the chronicle reflects them.

### Technical details

- Migration: `quests` table + RLS + `clamp_reward(severity, raw_reward)` SQL function + journal trigger cases.
- Edge fn changes: `npc-respond` (parse `<<QUEST_OFFER>>` and `<<QUEST_RESOLVE>>`, inject ACTIVE QUEST block); `inventory-action`, `combat-action`, and `moveTo` get tiny "check open quests" hooks; new `quest-action` fn handles `accept|decline|abandon`.
- Client: `QuestsPanel.tsx`, HUD button, command parser additions, inline accept/decline buttons after NPC replies.
- Anti-abuse: cap one active quest per (npc, player); cap five concurrent active quests per player; expired quests auto-fail in `world-tick`.

### Out of scope (ask later)

- Quest chains / prerequisites (next quest unlocked by completing prior).
- Faction-gated quests (Chaos enclaves giving sabotage missions vs Aether wardens).
- Multi-step quests with intermediate objectives.
- Player-shared / party quests.
