# The World / Everbloom

A persistent multiplayer text RPG built with React, Vite, TypeScript and Supabase. The current game explores the First City, the silenced Speaker, Aethers, rune knowledge, NPC relationships and consequential player choices.

## Start here

- [Roadmap and release gates](ROADMAP.md)
- [Current project status and unpublished work](docs/PROJECT_STATUS.md)
- [Prioritized agent backlog and acceptance criteria](docs/AGENT_BACKLOG.md)
- [Agent working guide](AGENTS.md)

This is the active playable project. The separate `t0itle/theWorld` repository contains earlier prototypes. Roadmap items are plans, not claims that systems are complete or deployed.

## Local development

Inspect `package.json` for current scripts. The intended npm path is:

```sh
npm ci
npm run dev
```

Vite is configured for port 8080. Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for an authorized development project. Never place service-role or AI-provider secrets in client environment variables. Backend services also require their separately configured server-side credentials; do not copy production credentials into a test setup.

The reviewed base had npm lockfile inconsistencies. See W-001/W-003 before assuming a fresh install works, or switching package managers. Run `npm test`, `npx tsc --noEmit -p tsconfig.app.json`, `npm run build` and relevant lint checks for changes.

Historical migrations include destructive resets. Do not replay them against an existing live project. Database and edge-function releases require an explicit staging plan and deployment authorization.
