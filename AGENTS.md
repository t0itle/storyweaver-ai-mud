# Agent working guide — The World / Everbloom

## Read before changing code

1. `ROADMAP.md` — priorities, milestone gates and deferred scope.
2. `docs/PROJECT_STATUS.md` — what is upstream versus an unpublished local candidate.
3. `docs/AGENT_BACKLOG.md` — choose an authorized task and read its acceptance criteria.
4. Relevant source, migrations and any more-specific instructions in the directory you will edit.

This repository is the active playable game. Do not port the earlier `theWorld` prototype over it. The roadmap is proposed work, not permission to implement every item in a single pass.

## Operating rules

- Inspect branch, upstream commit and worktree changes first. Preserve unrelated work. A dirty workspace may contain the unpublished polish candidate.
- Use one focused task/PR. State the task ID, dependencies and intended files. Do not overwrite another agent's changes or force-push shared branches.
- Do not spawn or assign other agents merely because this file exists; follow the user's authorization and the environment's delegation rules.
- Do not merge, deploy, perform production migrations, run destructive endpoints or reset shared data without explicit task authorization. Never use live player data as a test fixture.
- Use configured credentials only through their intended clients. Never commit credentials, private player conversations, service-role tokens or production exports.
- Distinguish source findings from verified deployment behavior. Never label local tests as production validation.

## Code map

| Area | Primary entry points |
| --- | --- |
| Session and entry flow | `src/pages/Index.tsx`, `src/components/mud/Landing.tsx`, `Intro.tsx`, `CharacterCreation.tsx` |
| Gameplay client and commands | `src/components/mud/GameClient.tsx`, adjacent panels and hooks |
| Authoritative operations | `supabase/functions/*/index.ts` |
| NPC dialogue and AI context | `supabase/functions/npc-respond/index.ts` |
| Schema, seeds and historical lore | `supabase/migrations/` |
| Supabase generated types | `src/integrations/supabase/types.ts` |
| Tests | `src/test/`, `supabase/functions/_tests/` |
| Build and presentation | `package.json`, lockfiles, `vite.config.ts`, `tailwind.config.ts`, `src/index.css` |

## Implementation standards

- Keep the current stack. Prefer narrow extractions and measured optimizations over a rewrite. Do not add infrastructure without evidence and approval.
- Validate actor, ownership, room, resources and state on the server. UI disabling is not authorization. Multi-row reward/spend/reset operations need transactions or an explicitly reviewed recovery protocol.
- Add idempotency/concurrency tests for actions that change resources. Make denied, delayed, duplicated and out-of-order responses part of the test plan.
- Treat model output and scraped lore as untrusted data. Validate proposed actions; enforce knowledge gates and quotas outside the model. Never let narrative text alone mutate authoritative state.
- Preserve confirmed lore. Mark conflicts as unresolved and request owner decisions; do not invent deity names, gifts, relationships or mortality rules to reconcile a mismatch.
- Add forward migrations. Never edit applied migrations or replay historical wipes against shared environments. Document function/frontend deployment dependencies and recovery.
- Keep authoritative catalog data in one maintained source. Generate frontend types from the reviewed schema where practical; avoid divergent hard-coded copies.
- Ensure mobile controls, keyboard focus, explicit consequence labels, loading/error states and useful retries. Generated images/audio must not block core play.

## Verification and handoff

Run the relevant available checks from a clean task branch:

```sh
npm ci
npm test
npx tsc --noEmit -p tsconfig.app.json
npm run build
npm run lint
git diff --check
```

The reviewed upstream npm lockfile previously failed a clean install; W-001/W-003 address this. Report baseline failures rather than silently skipping them. Existing whole-repository lint debt must be reported separately from new violations. Do not claim the unpublished candidate's 28 tests are tests already on `main`.

For database/security work, run migration, rollback, RLS and role-boundary tests in a disposable database, then rehearse against staging with authorization. Frontend TypeScript/build checks do not validate edge-function execution or database permissions. For UI work, exercise the relevant flow on mobile and desktop with synthetic data. For performance work, include reproducible before/after measurements.

Use the handoff block in `docs/AGENT_BACKLOG.md`. Report what changed, tests run, tests omitted, unresolved risks and exact commit/PR. Separate implemented, merged, staging-verified and deployed status. Update roadmap/task status only when there is evidence for the transition.
