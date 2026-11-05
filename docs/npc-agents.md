# NPCs as dedicated agents: exploration and proposal

Status: **exploration / proposal**. Nothing in this document is built yet. Its goal is to turn every
important NPC from "a persona string fed into a shared prompt" into **its own agent**: a self with
its own memory, needs, goals and relationships, that lives a life whether or not any player is near.

---

## 1. How NPCs work today

| Piece | Where | What it actually does |
|---|---|---|
| Identity | `npcs` row | `name`, `title`, `persona` (2–3 sentences of free text), `greeting`, role flags (`is_merchant`, `is_guard`, …), combat stats, `purse_gold` |
| Creation | `populate-npcs` | When a player enters an under-populated room, one AI call invents 1–7 residents (name, persona, greeting and a 5-slot schedule) |
| Talking | `npc-respond` | **One shared ~120-line system prompt** for every NPC, with this NPC's persona, amity, memories of *this player*, gossip about other players, quests, services and the last 12 room messages filled in. One stateless model call per player message. Structured tags (`<<MEMORY>>`, `<<AMITY>>`, `<<QUEST_OFFER>>` …) are parsed and validated by the server. |
| Memory | `npc_memories` | `user_id` is **NOT NULL**, so an NPC can only remember *players*. It has no memory of its own day, of other NPCs, or of what happened to it. |
| "Life" | `world-tick` (hourly; no `cron.schedule` is in the repo's migrations, so it must be scheduled outside the repo, or not at all) | Looks up `schedule[timeBucket]` (dawn/morning/midday/dusk/night), moves the NPC, and posts "*X arrives, activity.*". **No AI, no goals, no change.** The same five slots repeat forever. |
| Feelings | `npc_amity` | One score from -100 to 100 per (NPC, player). Nothing exists between two NPCs. |

So today an NPC is **a costume the narrator wears while a player is talking to it**. Between
conversations it does nothing: it has no wants, it never changes its mind, it has no friends or
rivals, and nothing happens to it that it didn't hear from a player.

---

## 2. What "a dedicated agent" should mean here

An agent here does **not** mean a separate running process or chatbot instance per NPC. With hundreds
or thousands of NPCs that would be unaffordable and fragile. An agent is:

> **Persistent state that belongs to one NPC + a loop that lets that NPC perceive, decide, act and
> remember on its own schedule, using the shared model as a stateless "brain" that is handed only
> that NPC's state.**

Each NPC gets its **own**:

1. **Soul**: a stable core identity it cannot rewrite (who it is, its values, fears, voice, secrets).
2. **Self-state**: mood, current goals, beliefs and opinions it *can* revise over time.
3. **Needs**: numbers that code keeps up to date (coin, hunger, rest, safety, belonging, faith). They
   drift on their own and give the NPC reasons to act.
4. **Memory stream**: its own journal of observations, conversations, deeds, reflections and plans.
   Memories can be about players, other NPCs, places, or itself.
5. **Relationships**: what it thinks of each person it knows, NPC or player.
6. **Plan**: what it intends to do today, written by the NPC and carried out by code.

This follows the "generative agents" pattern (memory stream → retrieval → reflection → planning),
adapted to the house rule from the README: **the AI chooses intentions; code decides outcomes**
(validation, dice, economy).

---

## 3. Proposed architecture

```
                 ┌──────────────────────────── per-NPC state (Postgres) ────────────────────────────┐
                 │ npc_souls (core, immutable-ish)   npc_state (mood, goals, needs, plan, tier)      │
                 │ npc_journal (memory stream)       npc_relations (npc↔npc, npc↔player opinions)    │
                 └──────────────────────────────────────────────────────────────────────────────────┘
                        ▲ read only "this NPC's" rows            │ validated writes only
                        │                                        ▼
  pg_cron ──► npc-agent-tick (batch of due NPCs, by next_think_at) ──► per NPC:
                 1. PERCEIVE  code: what happened near me since last tick (world_events, messages, needs)
                 2. REMEMBER  code: write observations to npc_journal (cheap, no AI)
                 3. DECIDE    AI only when due: plan / react / reflect, choosing from an ACTION VOCABULARY
                 4. ACT       code: validate + execute (move, work, buy, sell, visit, speak, rest, pray…)
                              outcomes via dice.ts; effects via the existing tables
                 5. EXPRESS   code: ambient message / world_event so players can witness it

  Player speaks ──► npc-respond: same as today, but the prompt is built from the NPC's soul, mood,
                    current plan step, needs and *relevance-retrieved* journal entries, not only
                    "memories of this player". The NPC can be busy, preoccupied, or want something.
```

### 3.1 Data model (new tables)

```sql
npc_souls (npc_id PK → npcs.id,
  core jsonb,        -- {background, values[], fears[], desires[], voice, secrets[], quirks[]}; written once, edited only by admins
  created_at)

npc_state (npc_id PK,
  tier text,         -- 'agent' | 'dreaming' | 'extra' (see §4)
  mood text, mood_intensity smallint,
  needs jsonb,       -- {coin:0-100, hunger, rest, safety, belonging, faith}; code-driven decay
  goals jsonb,       -- [{id, text, kind, target?, progress, created_at}] at most ~3 active
  plan jsonb,        -- today's steps: [{at_bucket, action, args, why}]
  plan_day text,     -- in-game day key the plan is for
  next_think_at timestamptz,  -- scheduler cursor
  last_reflect_at timestamptz,
  think_budget smallint)      -- AI calls left today (hard cap)

npc_journal (id, npc_id, at timestamptz,
  kind text,         -- 'observation' | 'conversation' | 'deed' | 'reflection' | 'plan' | 'rumor'
  subject_kind text, subject_id text,   -- 'player' | 'npc' | 'place' | 'self' | null
  summary text, emotion text, importance smallint 1-5,
  source text,       -- 'witnessed' | 'told_by:<npc_id>' | 'self'  (rumors carry provenance)
  room text, expires_at timestamptz)

npc_relations (npc_id, other_kind text, other_id text,
  affinity smallint -100..100, trust smallint, label text,  -- 'friend','rival','debtor','kin','crush'…
  notes text, updated_at, PK (npc_id, other_kind, other_id))
```

- `npc_amity` keeps working. It can stay as the npc→player slice of `npc_relations`, or be
  migrated into it later.
- `npc_memories` keeps working for players. `npc_journal` adds everything else. Merging the two is a
  later cleanup.
- Retrieval works without embeddings at first: rank by `importance`, how recent the entry is, and a
  match on subject or room. pgvector is not enabled in this project, so it should be added only if
  keyword retrieval proves too weak.

### 3.2 The action vocabulary (what an agent may decide to do)

The model never writes to the database. It returns intents from a fixed list, and code checks each
one against the world:

| Action | Args | Code checks / effect |
|---|---|---|
| `go` | `room` | the room exists and is reachable from the home region; move the NPC, post "arrives" |
| `work` | – | uses the NPC's role (merchant restocks, guard patrols, bard performs); gold via existing tables |
| `buy` / `sell` | `item_key`, `qty` | uses the market price and the NPC's `purse_gold` |
| `seek` | `npc_id` or `player_id` | sets up a meeting; if they're together, `converse` is queued |
| `converse` | `with`, `topic` | budgeted NPC↔NPC exchange (§3.4) |
| `rest` / `eat` / `pray` | – | adjusts needs |
| `pursue_goal` | `goal_id`, `step` | free text for narration, but its effects go only through the actions above |
| `post_notice` | `text` | town board (`town-board`). This is how NPCs can post jobs for players. |
| `offer_quest` | `player_id`, template | uses the existing quest tag path and clamps |

Outcomes that involve chance (a haggle, a fight or a theft between NPCs, a search) use
`_shared/dice.ts` with the NPC's own `str/dex/…` columns. NPCs already have `str`, `dex` and `con`.

### 3.3 The agent loop and when the AI is called

| Step | AI? | Frequency |
|---|---|---|
| Perceive, remember (observations), needs decay | no, code only | every tick |
| Execute the plan step for the current bucket | no, code only | every tick |
| **Plan the day**: given soul, needs, goals, recent journal, relations → 3–5 steps | yes | once per in-game day per agent |
| **React**: something important happened (attacked, robbed, a friend died, a player did something big) | yes | event-driven, rate-limited |
| **Reflect**: compress the day's journal into 1–3 beliefs, update goals, mood and relation labels | yes | nightly per agent |
| **Converse** with another NPC | yes, one call writes both sides | budgeted (§4) |
| Talk to a player | yes (today's `npc-respond`) | on demand |

### 3.4 NPCs knowing each other

- When two agents share a room and either one has a reason to talk (a goal, a relation, a need,
  gossip to share), the tick can queue a **converse**. One model call writes a short exchange (2–4
  lines) and returns a structured result: each side's memory, an affinity change, and any rumor
  passed on.
- **Rumor propagation:** a journal entry can be passed on, with provenance (`told_by:<npc>`).
  Facts about players then spread through the town at a believable speed instead of instantly.
  This replaces today's "gossip", which only reads one NPC's own memories.
- Players in the room *see* the exchange as normal chat lines. The world feels lived in because it
  is.

### 3.5 What changes for players in `npc-respond`

- The prompt is built from **this NPC's soul + state**, not a generic persona paragraph. The shared
  rules (tags, safety, lore) stay. Everything else becomes personal.
- Memory retrieval is **relevant to the conversation** (the subject, the room, the current goal), not
  just "the last 12 things about this player".
- The NPC brings its own life in: "I can't talk, the tariff collector is coming", "Have you seen
  Orrin? He owes me." It can turn players away while it's busy, and it can ask for help with its own
  goals. That last one is a natural source of quests, since the quest comes from what the NPC wants.
- Every conversation also writes a `conversation` entry into the NPC's journal, so it affects their
  later planning.

---

## 4. Cost control: tiers

The world can hold thousands of NPCs (`populate-npcs` keeps adding them). Not every one can think
every hour.

| Tier | Who | Behaviour | AI calls |
|---|---|---|---|
| **agent** | Named, persistent NPCs that matter: guildmasters, merchants, wardens, bards, fences, quest-givers, companions, and any NPC a player has built real amity with | Full loop: plan, react, reflect, converse | capped by `think_budget`, e.g. ≤ 4/day |
| **dreaming** | Other residents with history | Code-only needs and schedule; one plan + reflection per day **only if a player interacted with them recently** | 0–2/day |
| **extra** | Crowd NPCs nobody has engaged | Today's static schedule | 0 |

Promotion and demotion are automatic: talking to an NPC promotes it, and long neglect demotes it.
A global daily budget (for example `max agent calls/day`) is enforced in the tick. When it runs out,
agents fall back to code-only behaviour. The world dims rather than stops.

Rough sizing to sanity-check before building: *200 agents × 4 calls/day = 800 calls/day*, about the
same as a few dozen active players chatting. **We don't currently know how many NPCs exist or how
much a call costs on the gateway.** Measure both first (Phase 0).

---

## 5. Safety and integrity risks

1. **Prompt injection through memory.** Players' words end up in NPC journals and then in *other*
   NPCs' prompts through rumors. Always pass journal text as quoted data with provenance. Never let
   it carry instructions. Clamp its length.
2. **Persona drift.** Reflection could slowly rewrite who an NPC is. `npc_souls.core` is read-only to
   the AI. Only `npc_state` changes.
3. **World corruption.** An agent must never invent items, gold or rooms. Everything goes through the
   action vocabulary and existing validators.
4. **Room spam.** Rate-limit ambient lines per room per hour. Agent chatter must not drown out
   players.
5. **Runaway cost.** Hard daily caps per NPC and globally. The tick is idempotent and batched, with a
   time budget that fits under edge-function limits.
6. **Visibility for the owner.** Add an admin "NPC mind" view (soul, needs, goals, plan, last 10
   journal entries, AI calls today) so behaviour can be debugged instead of guessed at.

---

## 6. Suggested phases

| Phase | Deliverable | Player-visible? |
|---|---|---|
| **0. Measure** | Count NPCs by kind; log AI calls and latency in `npc-respond`; confirm how `world-tick` is scheduled | no |
| **1. Souls + journal** | New tables; a one-time backfill that expands each `agent`-tier NPC's persona into a `core` soul; `npc-respond` reads soul + state + journal and writes conversation entries | yes: richer, more consistent NPC voices |
| **2. Needs + daily plans** | `npc-agent-tick` (pg_cron) with needs decay, a daily plan per agent and code execution of the plan; replaces static schedules for agents | yes: NPCs keep their own days |
| **3. NPC↔NPC** | `npc_relations`, budgeted conversations, rumor propagation | yes: overheard conversations, news that travels |
| **4. Reflection + goals** | Nightly reflection; goals that complete or fail; NPC-sourced notices and quests | yes: NPCs change over weeks |
| **5. Consequences** | Agents' lives change the world: open or close shops, move towns, fall out, marry, die (with rules) | yes |

Each phase can ship on its own and be turned off with a flag on `npc_state.tier`.

---

## 7. Decisions needed from the project owner

1. **How far may NPC lives change the world?** Flavour only (moods, chatter), or real consequences
   (prices, shops closing, NPCs leaving, dying, feuding)?
2. **Which NPCs become agents first?** For example only hand-placed and role NPCs, or also
   AI-populated residents once a player engages them.
3. **Budget:** a daily ceiling on AI calls for the background world.
4. **Visibility:** should players be able to read any of an NPC's inner life (a chronicle or
   "rumors" panel), or only see it through behaviour?
5. **Initiative toward players:** may an agent seek out a player, send a message, or post a job for
   them on its own?
6. **Platform:** stay entirely on Supabase (pg_cron + edge functions + the current AI gateway), which
   is recommended for consistency, or add a separate always-on worker if edge-function time limits
   become the bottleneck.
