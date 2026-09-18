# Project status and handoff

As of 2026-09-18. Remote `main` checked at `cea91c14a4c57d752f931f6f7e1d481fa4a81b19`.

## What exists

The playable repository uses React/Vite/TypeScript, Supabase Postgres/realtime and edge functions, with generated NPC dialogue/media. Existing systems include creation, classes/awakening, Aether alignment, rune discovery/casting, combat, quests, companions, crafting/gathering, markets, death/revival and world events. Presence in source is not proof that every advertised effect works end to end.

`README.md` on the reviewed base was a placeholder. This documentation change establishes a navigation point and an execution plan; it does not change gameplay or deploy anything.

## Pending polish: do not mistake this for merged work

A prior local pass prepared the following changes. Its GitHub upload failed before any new tree/commit/branch/PR was successfully created. These changes are NOT included in this roadmap-only publication:

- Player-paced Speaker/First City intro; class selection sent to the creation endpoint; honest gate start; catalog retry UI.
- Optional portrait generation and transactional creation/starting kit.
- Silent Veiled arrival text, contextual first steps and deliberate Aether refusal instead of penalizing panel dismissal.
- Cancellation of stale room loads, travel guardrails and correctly addressed arrival messages.
- Current-catalog NPC lore context, class-reset cleanup, profile-load retry and shared palette/mobile fixes.
- Reconciled npm lockfile, eight new interaction tests, two migrations and implementation review notes.

The previous workspace is `/workspace/scratch/0f5b1682b97d/storyweaver-ai-mud`. It is a transient local snapshot, NOT a normal clone with the upstream commit history. Its local baseline commit is `d41030f`; it represents source fetched from upstream `cea91c1`. Do not push that synthetic root history over the remote. Recover the patch onto a fresh upstream branch or construct a commit with the genuine upstream parent.

If the workspace is unavailable, the candidate cannot be assumed recoverable from GitHub. Ask the owner for the saved patch/session or implement W-001 afresh from its acceptance criteria.

### Candidate file inventory

```text
package-lock.json
src/components/mud/Intro.tsx
src/components/mud/CharacterCreation.tsx
src/components/mud/HallOfChoice.tsx
src/components/mud/GameClient.tsx
src/pages/Index.tsx
src/index.css
tailwind.config.ts
supabase/functions/create-character/index.ts
supabase/functions/refuse-aethers/index.ts
supabase/functions/npc-respond/index.ts
supabase/functions/restart-character/index.ts
supabase/migrations/20260914000100_polish_character_creation.sql
supabase/migrations/20260914000200_align_lore_catalogue.sql
src/test/onboarding.test.tsx
docs/lore-and-flow-review.md
```

The two downloaded image assets appearing untracked in that snapshot already exist upstream; they are not new art to commit.

## Recorded validation, with limits

The prior local candidate passed 28 Vitest tests, frontend TypeScript checks, production build, targeted onboarding lint, isolated PostgreSQL-compatible migration fixtures and mocked mobile/desktop browser checks. Its clean npm install passed after lockfile repair. These were recorded during that pass; they have not been rerun as part of this documentation-only task.

No live Supabase staging/production deployment, paid-model end-to-end test, production authorization audit, concurrency certification or full-world playtest was performed. The original complete authored lore was not recovered. These are open gates, not completed work.

## Next handoff

Begin with W-002 authorization review and W-001 recovery, then W-003 CI and W-004 canon reconciliation. Read [the backlog](AGENT_BACKLOG.md) for exact scope and acceptance criteria. Record real PR/commit links here as implementation tasks are published, and update the status only after each relevant check or deployment succeeds.
