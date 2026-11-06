# Room memory and cadence

Rooms used to be stuck in one state: a fixed `description`, plus ambience lines that only existed in
one player's browser and were never saved. NPCs were told to "speak only", and any `*action*` was
deleted, so they couldn't move. They also never spoke first. This note describes the fix.

| Piece | File |
|---|---|
| Rules (facts, cadence, NPC openers, action validation), pure and tested | `supabase/functions/_shared/roomScene.ts`, tests `src/test/roomScene.test.ts` |
| Pulse: what happens next while a player is in the room | `supabase/functions/room-pulse/` (replaces `room-ambience`) |
| NPC physical actions in conversation | `supabase/functions/npc-respond/` (`<<ACTION>>` tag) |
| Client timer (45–90s per player) | `src/components/mud/GameClient.tsx` ("Living scene") |
| Schema | `drizzle/migrations/0010_room_scene.sql` (`room_scene`, service-role only) |

## Room memory

`room_scene.facts` is a short list of lasting changes, for example "the hearth has burned down to
embers" or "Maren's ledger lies open on the desk". Each fact expires after `FACT_TTL_HOURS` (3), and
at most `MAX_FACTS` (6) are kept, so a room changes over time instead of piling up state. Facts come
from two places:
- an ambient or NPC-business line that leaves a lasting change (the model's `scene` field)
- an NPC's `<<ACTION>>` in `npc-respond`, plus its optional `scene`

Both `room-pulse` and `npc-respond` show the live facts in their prompts as quoted data
(`sceneBlock`). Every pulse line is saved to `messages`, so the room's recent history (and therefore
`npc-respond`'s "recent goings-on") includes what happened. A player who enters a room sees the last
15 minutes of it.

## Cadence: code decides, the AI writes

Each player's client asks `room-pulse` every 45–90s. `decidePulse` picks one outcome:

| Outcome | When | AI cost |
|---|---|---|
| `none` | the room pulsed less than `PULSE_GAP_SEC` (40s) ago, e.g. from another player's client | 0 |
| `npc_speak` | an NPC with amity ≥ 20 **or** an open want, off cooldown, and no AI opener in this room for `NPC_AI_GAP_SEC` (5 min); 35% roll. An NPC with a want goes first. | 1 call |
| `npc_greet` | any off-cooldown NPC; 15% roll. Template line chosen by amity or want. | 0 |
| `npc_business` | any present NPC; 40% roll. A small physical action that fits the room. | 1 cheap call |
| `ambient` | otherwise | 1 cheap call |

- **One stream per room.** The pulse is claimed with an atomic conditional update on
  `last_pulse_at`, so two players in one room share events instead of doubling them. That makes
  the cheap calls no more expensive than the old per-player `room-ambience`, and cheaper when rooms
  are shared.
- **Openers are rare and not repeated.** The AI opener also claims `last_npc_ai_at` atomically. If
  the claim fails it falls back to a free template. Each NPC has a 10-minute opener cooldown
  (`npc_spoke`).
- **Disclosure is kept.** An NPC only names its want to a player at amity ≥ 20, the same rule as
  `npcVoice`. With strangers it can only hint.
- **Privacy.** Pulse prompts read only shared lines (`addressed_to IS NULL`), never a player's
  private conversation. NPC openers and template greetings are addressed to that one player. Actions
  and ambience are shared.
- Bosses, Aethers, souls, `aggro_on_sight` NPCs and NPCs behind a rune gate never start a
  conversation, but they can still do business.

## NPC actions

`npc-respond` may return one `<<ACTION>>{"text": "...", "scene": "..." | null}<<END>>`. The server
posts it as a shared ambient line **before** the NPC's speech and adds it to the room's facts.
`sanitizeAction` rejects actions that contain speech or don't start with the NPC's name, which
blocks actions done by or to the player. An action never moves items or gold. That still goes
through `ITEM_OFFER`, `QUEST_OFFER` and the other validated tags. The NPC's spoken reply is still
stripped of `*stage directions*`.

## Limits and known gaps

- Pulses run only while a player is in the room (client-driven), the same as the old ambience.
  Off-screen life is still the hourly `npc-agent-tick`.
- `npc-respond` and a pulse can both write `facts` at the same moment. One of the two writes can be
  lost. That costs at most one fact.
- NPC openers are not journaled or counted toward amity. The player answers with `ask` as usual.
