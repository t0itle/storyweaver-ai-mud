# Agent execution backlog

Read [ROADMAP.md](../ROADMAP.md) and [AGENTS.md](../AGENTS.md) first. All tasks below start **TODO** as of 2026-09-18; previously prepared local work is not a merged deliverable. Suggested lanes describe skills, not assigned agents. No agent is currently assigned by this document.

Claim one task in a PR description or issue with the task ID, owner, intended files and baseline SHA. Check existing claims before editing shared files. Use `TODO → IN PROGRESS → IN REVIEW → MERGED → STAGING VERIFIED → RELEASED`, or `BLOCKED` with a reason. Do not create issues or delegate work unless authorized for that task.

## First queue

1. **W-002:** inspect and contain privileged endpoint exposure; do not invoke destructive endpoints.
2. **W-001:** recover the existing local polish patch and publish it as a separate implementation PR.
3. **W-003:** establish clean-checkout CI and capture baseline failures.
4. **W-004:** prepare the canon conflict register for owner decisions.

These investigations can proceed independently with agreed ownership. W-001 owns onboarding implementation files; W-002 owns privilege/RLS changes; W-003 owns CI/config; W-004 owns canon documentation. Do not run competing edits to `GameClient.tsx` or a shared migration.

## Task cards

### W-001 · P0 · Recover and stage the polish candidate

- Lane: integration. Dependencies: none; release also requires W-002 containment.
- Inspect: [candidate status](PROJECT_STATUS.md); current `main`; the prior workspace patch if recoverable.
- Deliver: implementation PR, updated generated Supabase types if required, staging rollout checklist, reproducible regression tests. Keep it separate from this roadmap PR.
- Accept: named race/class creation succeeds; portrait outage does not block entry; starting kit is granted once; gate guidance and silent Veiled work; closing the Hall is neutral; duplicate clicks/retries are safe; mobile action buttons are visible.
- Verify the two candidate migrations with real staging triggers/RLS, missing-profile handling, simultaneous creation requests and rollback on item failure. Review orphaned portrait cleanup and retry semantics. Do not assume the candidate is production-ready merely because its isolated tests passed.

### W-002 · P0 · Privileged endpoints and permission matrix

- Lane: security/backend. Dependencies: none.
- Inspect: `supabase/config.toml`, `admin-wipe`, `sync-lore`, generated-media functions, authenticated/service-role clients, profile/item/skill policies and RPC grants.
- Deliver: endpoint permission matrix; targeted authorization fixes or removal of development-only operations; tests for anonymous, player A, player B and authorized administrator roles.
- Accept: no normal player or unverified request can perform administrative writes, overwrite canon, spend another player's resources or trigger unbounded paid generation. Verify deployed gateway settings with permission, not assumptions from comments.
- Do not test a wipe against any shared environment. Use mocks or a disposable database with synthetic records.

### W-003 · P0 · Reproducible build and CI

- Lane: build/test. Dependencies: coordinate lockfile ownership with W-001.
- Inspect: `package.json`, `package-lock.json`, `bun.lock`, `bun.lockb`, Vite/Vitest/TypeScript/ESLint configuration.
- Deliver: documented supported Node/package-manager versions, one chosen install path, CI for install, tests, frontend typecheck and production build; changed-code lint and a separate baseline-debt report if global lint already fails.
- Accept: fresh checkout reproduces the build; no secret is needed for ordinary unit tests; CI artifacts show bundle sizes; failures are not suppressed. Do not delete alternate lockfiles until the deployment package manager is confirmed.

### W-004 · P0 · Canon register and consistency tests

- Lane: narrative/data. Dependencies: owner decisions for disputed canon.
- Inspect: lore migrations, `aethers`, NPC personas, intro/narration, `sync-lore`, existing death/revival behavior. Obtain an authorized read-only staging catalog export when available.
- Deliver: `docs/LORE_CANON.md` with citations/provenance, unresolved decisions and version; one approved roster; machine-readable fixture and consistency tests after approval.
- Accept: gods/domains/realm names agree across approved lore and seeded data; Veiled silence and novice speech are explicit; class is not allegiance; historical proposals are not presented as settled canon. No lore scraper can replace approved prose with a page shell.

### W-005 · P1 · Complete the first-hour vertical slice

- Lane: gameplay/UX. Dependencies: W-001, W-004 core decisions; rewards use W-007 before release.
- Inspect: `Index.tsx`, `CharacterCreation.tsx`, `GameClient.tsx`, `onboarding-tick`, `quest-action`, room exits and NPC placement.
- Deliver: a small starter objective using existing rooms/NPCs, contextual command help, journal feedback and resumable progress.
- Accept: new and returning users can complete the same documented route with no forced oath, dead end or duplicate reward. Test a reconnect at every step, unavailable AI, denied requests, keyboard-only play and a 390px viewport. Confirm guidance matches actual exits and teacher locations.

### W-006 · P1 · Mortality and restart contract

- Lane: gameplay/backend. Dependencies: W-004 mortality decision; W-002 permissions.
- Inspect: `DeathSaveModal`, `combat-action`, `revive-player`, `restart-character`, class/awakening, companion, escort, inventory, visits, banking and progression tables.
- Deliver: state-transition specification and a reviewed persistence/reset matrix, then atomic or recoverable implementation.
- Accept: each downed/dead/revived/restarted state has valid actions; failures cannot leave half-reset characters; no class powers or unintended rewards survive a reset; no approved account-level persistence is erased. Test simultaneous revive/restart and duplicate requests. Preserve the current contract until a new one is approved.

### W-007 · P1 · Transactional resource and progression actions

- Lane: database/backend. Dependencies: W-002; coordinate with W-001 creation RPC.
- Inspect: `quest-award`, `take-loot`, `spend-talent`, `market-action`, `craft-item`, inventory writes and their table constraints.
- Deliver: one small PR per action family, using validated inputs, authoritative preconditions, transactions/locks and idempotency receipts where appropriate.
- Accept: concurrent claims grant one reward; gold/items/talent points cannot go negative or duplicate; cross-player access is denied; forced failure rolls back all related writes; emitted events reflect only committed actions. Commit concurrency and rollback tests to the repository.

### W-008 · P1 · Authoritative travel and realtime recovery

- Lane: backend/frontend. Dependencies: W-002; W-001 fixes reviewed.
- Inspect: `GameClient.tsx` movement/room effects, `wagon-travel`, `desert-wander`, extra exits, companions, escorts, profile RLS and visits.
- Deliver: server-validated travel contract that preserves intended fast travel, plus client reconciliation and bounded subscriptions.
- Accept: clients cannot bypass faction/combat/location restrictions; rejected moves do not move companions; arriving messages name the destination; delayed responses cannot restore an old room; reconnect recovers truth. Test two browsers and all travel mechanisms, not only the north button.

### W-009 · P1 · Verify classes, runes and combat progression

- Lane: gameplay/testing. Dependencies: W-006 and W-007 for related states.
- Inspect: `class_defs`, `class_skill_nodes`, `spend-talent`, `awaken-class`, rune learning/casting and `combat-action`.
- Deliver: a matrix connecting each displayed ability to implemented effects; tests for representative melee, caster and support paths; explicit labels or feature gates for unfinished abilities.
- Accept: claimed talents consume the right resource once; prerequisites hold server-side; learning a word is distinct from learning its shape; death saves and awakening follow approved rules. Do not advertise an unimplemented effect as usable.

### W-010 · P2 · Decompose the game client safely

- Lane: frontend architecture. Dependencies: characterization tests from W-005/W-008.
- Inspect: `src/components/mud/GameClient.tsx` (approximately 3,000 lines in the local candidate), command parsing, room loading, combat and panel orchestration.
- Deliver: small behavior-preserving extractions with explicit interfaces: command parser, action adapter, room-data hook, combat controller, presentation panels.
- Accept: first-hour and travel tests remain green; no duplicated subscription ownership, circular imports or new global mutable state. Separate refactors from balance and narrative changes.

### W-011 · P2 · Profile and reduce frontend/database work

- Lane: performance. Dependencies: W-003 baseline; coordinate with W-010.
- Deliver: reproducible profiling script, cold/warm route traces, bundle report, request/subscription counts and targeted query-plan analysis in staging. Implement the highest measured bottleneck first.
- Accept: publish before/after numbers with identical conditions and at least 30 samples for latency claims; meet or explicitly revise the provisional roadmap budgets. Test low-end mobile behavior and a long-session soak. Do not trade correctness or accessibility for a smaller number.

### W-012 · P2 · AI reliability, lore retrieval and cost controls

- Lane: AI/backend. Dependencies: W-002, W-004; W-007 validates resulting actions.
- Inspect: `npc-respond`, `room-ambience`, `scene-image`, audio/portrait generation and lore ingestion.
- Deliver: versioned prompts, bounded retrieval, response schemas, timeouts, deduplicated media jobs, cache invalidation, quotas, cost/error instrumentation and deterministic fallbacks.
- Accept: hostile player text or retrieved text cannot grant rewards or change privileges; hidden lore stays gated; retries do not multiply paid generation; unavailable models leave the core game playable. Use canned responses in CI; paid live evaluations require an approved budget.

### W-013 · P2 · NPC relationship and memory pilot

- Lane: simulation. Dependencies: W-004, W-012.
- Deliver: one-region fixture with persistent memories, provenance, relevance/retention policy, schedule and relationship transitions.
- Accept: NPCs remember committed events across sessions without inventing rewards, leaking another player's private state or infinitely growing prompts. Track memory retrieval quality and per-conversation cost. Provide a feature flag and rollback path.

### W-014 · P3 · Aether/warden/territory pilot

- Lane: simulation/backend. Dependencies: W-007, W-009, W-013; owner approval for world-changing rules.
- Deliver: one Aether's bounded state machine with versioned ticks, capped effects and event journal. Evaluate existing warden/fallen-state rules first.
- Accept: repeated ticks are idempotent; time advancement is reproducible; state changes do not duplicate rewards, erase player progress or create unreachable areas. Simulate before enabling even a single region. Global autonomous war is outside this task.

### W-015 · P2 · Telemetry and economy/balance review

- Lane: analytics/gameplay. Dependencies: W-005 and W-007; instrumentation may start earlier.
- Deliver: privacy-conscious first-session funnel, error/reconnect rates, rewards/spending/death metrics and AI-cost report; synthetic scenarios covering representative builds.
- Accept: proposed balance changes cite observed evidence and uncertainty. Record conservation tests and representative simulations; do not silently alter live economy constants. Agree with the owner on success thresholds and acceptable AI cost per session.

### W-016 · P1 release gate · Closed-alpha readiness

- Lane: release/QA. Dependencies: M0–M3 gates, W-015 baseline; W-013/W-014 may remain disabled.
- Deliver: staging playtest report, accessibility and multi-browser checks, load/soak results, migration rehearsal, backup/restore drill, monitoring and rollback runbook.
- Accept: no unresolved critical authorization/data-loss bugs; first-hour flow survives reconnect and provider outage; performance meets agreed budgets at the agreed concurrency; deployment is explicitly approved. Record exact deployed commit and migration versions.

## Required handoff block

Every task PR must include:

```text
Task ID / milestone:
Baseline commit:
Owner and files owned:
Implemented vs proposed:
Dependencies and canon decisions:
Checks run (commands, results, environment):
Checks not run and why:
Schema/API/prompt changes:
Deployment order and rollback/roll-forward:
Known risks / follow-up task IDs:
Status: in review / merged / staging verified / released
```
