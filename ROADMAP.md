# The World / Everbloom — development roadmap

Updated: 2026-09-18. Planning baseline: `cea91c14a4c57d752f931f6f7e1d481fa4a81b19` on `main` in `t0itle/storyweaver-ai-mud`.

This is the active playable project. `t0itle/theWorld` is an earlier prototype, not the source of truth for the current implementation. “The World” is the project vision; the current game presents itself as Everbloom. Keep existing branding until the owner approves a change.

Start here, then read [current status](docs/PROJECT_STATUS.md), [agent tasks](docs/AGENT_BACKLOG.md), and [working rules](AGENTS.md). This roadmap is proposed direction, not evidence that a feature has shipped. Milestones are ordered by release gates rather than promised dates.

## Product goal

A persistent, lore-consistent multiplayer text RPG in which a new walker can enter the First City, understand how to act, form relationships, and make meaningful choices without needing a walkthrough. Aethers, vows, rune knowledge, mortality and NPC memory should affect the game through verifiable systems—not just generated prose.

The near-term deliverable is one reliable first-hour adventure. Stabilize that before adding kingdoms, currencies, classes or a new engine.

### Design commitments

- Preserve the Speaker's silence, seven Aethers, welcoming Veiled and First City identity while resolving contradictions with the owner.
- Treat class/calling, Aether allegiance and refusal as distinct player choices. Make irreversible consequences explicit before confirmation.
- Let players explore before demanding allegiance. Teach movement, conversation, inventory, quests and risk through useful actions.
- AI may narrate and propose interactions; authoritative game rules decide rewards, knowledge, inventory, combat and world changes.
- Make mobile play, keyboard use, reconnects and graceful AI-service failures first-class requirements.
- Treat the current death/revival system and older legacy/side-character ideas as different designs until reconciled. Do not silently replace one with the other.

## Release sequence

| Milestone | Scope and task IDs | Exit gate |
| --- | --- | --- |
| M0 — Establish a safe baseline | Publish/review pending polish (W-001); security audit and containment (W-002); reproducible build and CI (W-003) | Changes are actually in GitHub; staging creation works; destructive/admin actions require real authorization; repeatable build/test checks exist. No production reset. |
| M1 — Canon and first-hour slice | Canon register (W-004); onboarding/first quest (W-005); restart and mortality consistency (W-006) | Owner resolves blocking canon choices; a new player reaches the city, completes a small objective, receives exactly one reward and can return after reconnecting. Swearing is optional and informed. |
| M2 — Authoritative systems | Transactional actions (W-007); reliable travel/realtime (W-008); representative class/rune loop (W-009) | Concurrent requests cannot duplicate rewards or overspend; permissions are tested; two clients see consistent movement, combat and death state. |
| M3 — Fast, maintainable build | Frontend extraction (W-010); measured performance (W-011); bounded AI pipeline (W-012) | Profiling proves improvements; no first-hour regressions; AI costs, timeouts and fallback rates are visible and bounded. |
| M4 — Living-world pilot | NPC memory and schedules (W-013); Aether/warden simulation pilot (W-014) | One bounded region demonstrates persistent, explainable consequences without breaking canon, the economy or offline players' progress. |
| M5 — Closed alpha | Balance and observability (W-015); release hardening (W-016) | Staging soak, restore drill, accessibility checks and a small invited playtest pass. Blocking defects are resolved before expanding access. |

W-002 and W-004 investigation can begin immediately. Do not block urgent security containment on the polish merge. Performance instrumentation can start early; architectural changes should follow characterization tests. Agent work may run independently only when file ownership and dependencies have been agreed.

## M0: stop treating local work as shipped

The prior polish pass is prepared locally but has no successful GitHub commit/PR. The upload failed at the approval/usage-limit step. Its recorded 28-test result applies to that local candidate, not current `main`.

Recover and publish that patch separately from this documentation change. Review it against current `main`, especially its creation RPC, two migrations, travel changes and class-reset cleanup. Deploy the creation migration before its edge function and frontend. Use staging to validate the real schema, RLS and triggers; isolated SQL fixtures are not a staging deployment.

Source inspection also flags immediate security review:

- `supabase/functions/admin-wipe/index.ts` checks a fixed request header in its handler, despite a comment claiming service-role authentication. Gateway protection and deployed accessibility have not been verified. Disable/remove the operational endpoint or enforce audited administrator authorization. Never call it as a diagnostic.
- `sync-lore` is configured with JWT verification disabled and writes through a service-role client. Audit caller authorization, permitted sources and protection against overwriting canonical text with an empty application shell.
- Inspect client profile updates and table policies before assuming UI restrictions enforce game rules. Test authorization from a second player account in an isolated environment.

These are source-level findings and audit priorities, not claims of a confirmed production exploit.

## M1: make the first hour coherent

The intended entry sequence is: sign in, read/skip the hook, create a named walker with a calling, approach the gate, learn an action, complete a small objective, and consider an Aether only when ready.

Choose an existing NPC and room for the starter objective after validating current seeds. Prefer a non-combat introduction followed by optional controlled combat. Show what changed in the journal and inventory. Do not award items or gold solely because an NPC's generated text says it did.

Create a versioned canon register with three explicit states: approved canon, implementation fact, and unresolved proposal. The original full authored lore is not available in the reviewed source. Later throne migrations reference Solastin, Khalvaris, Nyxara, Thalvora, Lazareth, Velithria and Morvayne, while older seed prose and catalogs differ. Get owner approval before changing names, domains, deity count or gifts. Use a read-only staging export to compare installed data with migrations.

Questions requiring owner decisions:

1. Which seven-Aether roster and domains are canonical, and how do the earlier additional-god ideas fit?
2. Is the initial gate approach permanent, or should a playable shore/desert branch return later?
3. How should current downed/death/Necros revival relate to the original temporary side-character and legacy-inheritance vision?
4. Is Everbloom the final player-facing title or a working name within The World?

Non-blocking gameplay and security repairs should continue while these decisions are recorded.

## M2: put important state changes behind trusted rules

Start with character creation, movement, quest rewards, loot claims, talent spending, purchases, allegiance and restart. Define a command contract for each: authenticated actor, allowed location/state, validated payload, idempotency rule, transactional writes and typed result.

Use database constraints and transactions for conservation rules. A disabled button is not protection against two tabs or a crafted request. Clients must not be able to grant themselves gold, HP, gifts or knowledge. Do not blindly revoke all profile writes before replacing legitimate client flows with validated commands.

On errors, preserve the player's last confirmed state and give a useful retry. Document which failures are retryable. Events and journal entries should reference the committed action, not an optimistic client claim.

## M3: optimize the existing stack

Retain React, Vite, TypeScript and Supabase unless profiling demonstrates a specific architectural blocker. The immediate opportunity is reducing unnecessary work and separating responsibilities, not rewriting the game.

### Frontend

- Extract `GameClient.tsx` incrementally: command parsing, authoritative action adapters, room/realtime loading, combat UI and presentation panels. One extraction per reviewed PR; preserve behavior first.
- Reuse the existing query library for catalog and player data with clear invalidation. Share cache keys rather than introducing a second state/cache system.
- Measure subscription count and event volume. Filter/debounce refreshes, cancel stale room requests, deduplicate in-flight work, and clean up subscriptions on travel/unmount.
- Profile long message logs before adding virtualization. Keep history bounded or paginated and preserve keyboard navigation and scroll position.
- Keep heavy panels and media lazy-loaded. Avoid blanket vendor chunking until bundle analysis identifies a useful split. Never hide build warnings by only raising thresholds.
- Audit image sizes, caching and audio requests. Reuse generated assets; do not regenerate portraits or room media on ordinary renders.

### Backend and AI

- Inspect query plans on staging for messages, visits, quests, inventory and NPC memory; add indexes based on observed filters and cardinality, not guesswork.
- Batch independent catalog reads and avoid per-item query loops where a set operation will do.
- Version prompts and lore. Retrieve bounded, relevant context rather than every historical memory. Keep secret/relic knowledge gated by player discovery.
- Use strict schemas for model-proposed actions, server-side validation, timeouts, request deduplication, per-player quotas and deterministic fallbacks.
- Record model-call latency, token usage, estimated provider cost, cache hits and fallback reason without logging private conversations or credentials by default.

### Provisional performance targets

These are engineering goals to validate, not measured production promises. Rebaseline on the same device/network, build mode and seeded dataset; include median and p95 across at least 30 representative samples.

| Measure | Initial target | Measurement |
| --- | --- | --- |
| Initial route JavaScript | At least 20% less gzip transfer than the measured baseline without delaying the next required screen | Production bundle report plus cold-cache browser network trace; include shared chunks. |
| Visible action feedback | Under 100 ms, independent of server completion | Browser event-to-feedback trace; never show false success. |
| Non-AI room transition | p95 under 1 second in the chosen staging test environment | Command start to settled room; report errors and payload size. |
| AI dialogue | Progress indicator immediately; timeout/fallback at a documented cap no greater than 15 seconds for dialogue | Timed test with normal, slow and unavailable providers; media has a separate budget. |
| Long-session stability | No unbounded growth in subscriptions, timers or retained log entries | 30-minute scripted travel/chat soak, comparing counts and heap after cleanup. |

Historical local candidate build: entry chunk about 530 kB minified / 158 kB gzip; game chunk about 312 kB / 89 kB gzip. These are chunk sizes, not total route transfer or live load times.

## M4–M5: deepen the world only after the loop holds

Pilot one region's NPC memory, schedule and relationship consequences. NPC decisions should cite relevant state and produce bounded, auditable events. Memory needs provenance, retention limits and isolation between players where appropriate.

Next, prototype one Aether's wardens and territory response behind a feature flag. Define reversible simulation steps, caps on resource changes and recovery from repeated ticks. Do not start with autonomous wars spanning every kingdom. Test that repeated scheduler delivery does not duplicate rewards or permanently trap players.

Instrument the first-session funnel, reward faucets/sinks, deaths, quest completion, errors, AI cost and retention before choosing balance changes. Use synthetic load and a small invited cohort, with an agreed concurrency budget. Delay unrestricted alpha until the security and restore gates pass.

## Definition of done for every milestone

- PR links task IDs, files, tests and evidence; status distinguishes proposed, implemented, merged and deployed.
- Existing and new regression tests pass; relevant TypeScript, build, SQL/RLS and browser checks run.
- Schema changes have forward migrations, deployment order, rollback/roll-forward strategy and backup requirements.
- Production data is never used as a test fixture; no reset/wipe is run without separate explicit approval.
- Owner decisions are recorded for canon/balance changes. No new systems are silently inferred from old brainstorms.
- A human can reproduce the result from a fresh checkout and understand the next unfinished task.

## Deliberately deferred

New token economies, wallet integrations, new engines, additional god rosters, broad world-map expansion, autonomous full-world wars, and a wholesale UI rewrite. Legacy/inheritance and NPC reproduction remain design exploration until canon, consent boundaries, mortality and persistence rules are approved. These ideas are not discarded; they follow a stable, measurable core game.
