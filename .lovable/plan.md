## First Walker onboarding — diegetic

Goal: no new player permadies without ever hearing the word **Sana**. Everything happens through an NPC who speaks to you in-fiction. The only new UI is one line in the existing Vows tab so a player who ignores the guide can still find the thread.

### The four beats

```text
Step 1  Wake              You spawn on Crescent Shore. A stranger — the First Walker's Mirror — is already there and speaks first.
Step 2  Word of Sana      Ask/accept the lesson. Mirror teaches the WORD "sana" (writes to player_lesser_rune_knowledge.knows_word).
Step 3  Shape of Sana     Mirror traces the sigil in wet sand; a single guided trace pass grants knows_symbol = true.
Step 4  First blood       Mirror points you at a weak shore-crab / driftwake NPC in an adjacent room; killing anything counts.
Step 5  The Sigils        Mirror tells you to walk north to the First City. Reaching first-city-gate closes the chain.
```

No hand-holding overlays, no arrows, no forced modals — just the Mirror talking, and the Vows tab quietly showing the current beat.

### Diegetic surface

- **New shore Mirror NPC** (`onboarding-mirror`) spawned in `crescent-shore`, greets any player whose onboarding step < 5 the moment they arrive (reuses the throttle pattern from `mirror-greet`).
- **Ask chips on this NPC**: "What is this place?", "Teach me Sana", "Show me the sigil", "Where do I go?" — the same quick-ask UI already used for Aether Mirrors.
- **Vows tab** gets a compact "First Steps" card above the Aether/Chaos chains showing the current beat's one-line hint. Dismisses itself when step 5 completes.

### Wiring into existing systems

- `handle_new_user` trigger seeds `onboarding_progress(user_id, step=1)`.
- `combat-action` on any `npc_killed` by an onboarding player bumps step 3→4.
- Room-entry (already tracked in `GameClient`) calls `onboarding-tick` when `current_room = 'first-city-gate'` to close step 4→5.
- The Sana lesson uses the existing `player_lesser_rune_knowledge` row for `rune_key='sana'` so `DeathSaveModal` "knows" check just works — no changes to death code.

### Technical

**Migration** (single file):
- `onboarding_progress(user_id uuid PK → auth.users, step int not null default 1, updated_at timestamptz)` + GRANTs + RLS own-row select/update + `updated_at` trigger.
- Insert one NPC row into `npcs` for `onboarding-mirror` at `crescent-shore` (greeting + is_guide flag reused).
- Extend `handle_new_user` to also insert the onboarding row.

**New edge function** `onboarding-tick` — actions `list` / `advance { to }` / `learn_word` / `learn_symbol`. Validates JWT, never lets step go backward, idempotent.

**Edits**:
- `combat-action/index.ts` — after a successful `npc_killed`, if actor is on step ≤ 3, set step = 4.
- `GameClient.tsx` — on room enter, if room = `first-city-gate` and step = 4, call `onboarding-tick { advance: 5 }`.
- `QuestsPanel.tsx` — add "First Steps" card at the top of the Vows tab, driven by `onboarding_progress`.
- Reuse the Mirror NPC quick-ask chip code already in `GameClient.tsx` — extend the branch so it recognises `onboarding-mirror` too.

### Out of scope

Weather, SFX, tab-complete, clickable keywords, fog-of-war, P2P trade, leaderboard — parked. Deploy/cron audit is a separate ~5-minute task I'll do right after this if you want.

### One thing to confirm

New players currently spawn at `crescent-shore`, and `first-city-gate` is a few rooms north. That geography works for a diegetic "walk toward the sigils" beat. If you'd rather spawn onboarding players directly at `gates-approach` (one step south of the First City gate) so step 5 is a single move, say the word and I'll shorten it.
