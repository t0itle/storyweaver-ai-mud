# NPCs as dedicated agents: exploration and proposal

Status: **design agreed (see §7); not built yet**. Its goal is to turn every
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

## 6. Brains: who thinks, how often, and on what hardware

The budget is minimal, so most NPC "thinking" has to cost nothing. Three layers:

| Layer | What it is | Runs | Decides |
|---|---|---|---|
| **1. Code brain** (utility AI) | Plain TypeScript in `_shared/npcMind.ts`: needs decay, every candidate action scored against needs, goals and personality traits, the best one picked | every tick, every agent | where to go, what to do, when a need becomes a **want** (and so a quest or a reach-out) |
| **2. Small model** (optional, later) | A 1–8B open model (Llama / Qwen / Gemma class), quantized, run with llama.cpp or Ollama on a cheap always-on box, with JSON-schema / grammar-constrained output | batched, off-peak | short barks, journal summaries, rumor phrasing, picking between options the code brain already ranked |
| **3. Director ("God AI")** | The large model on the current gateway, called a few times per in-game day | scheduled | world arcs: reads a compact world digest (economy, notable events, tensions, player activity) and returns validated directives such as assigning goals to agents, triggering shortages, feuds and festivals, seeding quests, or writing a soul for a newly important NPC |

**Talking to players stays on the large model** (today's `npc-respond`). It's on demand, so its cost
grows with the number of players, not the number of NPCs, and it's where players notice quality.

Notes on running a model "locally":
- Supabase Edge Functions **cannot** host a model: no GPU, small memory, short time limits. "Local"
  means a separate server that the tick calls over HTTP. That's a new running cost (a fixed monthly
  bill instead of paying per call) and something new to operate.
- **One shared small model, not one model per NPC.** What makes an NPC an individual is its state
  (soul, journal, relations) in the prompt, not its weights. Fine-tuning per NPC is wasted effort.
  Per-culture adapters (LoRA) could come much later.
- Small models are poor at long prompts, lore and keeping a character's voice consistent, and good at
  constrained choices and short text. Give them only constrained jobs.
- Everything calls an `NpcBrain` interface (`plan`, `bark`, `summarize`, `direct`), so switching a
  job between code, the gateway and a local model is a config change. **Start with layer 1 and the
  Director. Add layer 2 only when measurements show the gateway bill for barks and summaries is
  worth replacing.**

### 6.1 Presenting rich NPCs on a small budget

- **Simulate only what a player can see.** Off-screen agents run on the code brain only. When a
  player enters a room or talks to an NPC, the code works out what the NPC "did" since it was last
  seen from its journal and plan (a cheap catch-up), then presents it.
- **Disclosure is gated by amity (decision 4).** Every journal entry and soul field gets a
  `disclosure` level: public, then acquaintance (amity ≥ 20), then trusted (≥ 50), then confidant
  (≥ 80). `npc-respond` passes the model only what the player has earned, so secrets are learned by
  building relationships. This costs no extra AI calls.
- **Barks from templates first.** Ambient lines ("*Maren counts her last coins twice.*") come from
  trait- and need-driven templates filled in by code. The AI writes barks only where players are
  actually present.
- **Wants become quests (decision 5).** When a need stays unmet (coin low for days, a missing tool,
  a rival, a sick relative), the code brain creates a *want*. Depending on amity:
  - **Public:** post to the town board (`posted_quests`, with a new `author_npc_id`). The template
    comes from the want's kind, and the NPC pays from its own purse.
  - **Personal:** the NPC reaches out to a specific player it trusts. This needs a new **letters**
    feature (a per-player inbox; today messages only go to rooms). Delivery is shown in the world
    ("*A runner presses a sealed note into your hand.*").
  - Either way, `quest-award` pays the reward and the NPC's need is resolved. That closes the loop
    and leaves a journal memory.

---

## 7. Decisions (answered 2026-11)

1. **World impact:** big, built up over time. Agents' lives should change the world eventually.
2. **Order:** build the bones (data, loop, interfaces) before the meat (rich behaviour).
3. **Budget:** minimal. Use the code brain, gate disclosure behind amity, catch up only when a
   player is present, and keep any AI calls behind a global daily cap.
4. **Visibility:** players learn NPC inner life by talking to them, gated by amity.
5. **Initiative:** yes. NPCs post quests from real wants and can reach out to players directly.

Still open: whether to run a self-hosted small model (§6), and if so which host and monthly budget.

---

## 8. Phases (revised)

| Phase | Deliverable | AI cost |
|---|---|---|
| **0. Measure** | Count NPCs by kind and role; log `npc-respond` calls and latency; confirm `world-tick` scheduling | none |
| **1. Bones** | Tables (`npc_souls`, `npc_state`, `npc_journal`, `npc_relations`) with a `disclosure` level; `_shared/npcMind.ts` (needs, utility scoring, wants) with unit tests; `npc-agent-tick` running the code brain only, for hand-placed and role NPCs; the `NpcBrain` interface | none |
| **2. Voice** | `npc-respond` reads soul + state + amity-gated journal and writes conversation entries; template barks; catch-up on arrival | same as today |
| **3. Wants → quests** | NPC-authored `posted_quests`; letters inbox; rewards paid from the NPC's purse | none to low |
| **4. Director** | Daily world digest → large-model directives (validated); souls written for newly important NPCs | a few calls/day |
| **5. Society** | NPC↔NPC relations, rumor propagation, feuds, households, shops opening and closing, migration, deaths | low |
| **6. Small model (optional)** | Self-hosted model behind `NpcBrain` for barks and summaries | fixed hosting cost |
