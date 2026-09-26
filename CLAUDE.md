# TrialScout

Public demo (trialscout.cc) that checks a patient's plain-language profile against every eligibility criterion of recruiting oncology trials on ClinicalTrials.gov, using TypeSafe AI's Jev. Sibling of rxjev.cc. **A demo, not a medical product.**

- Scope source of truth: [product-seed.md](product-seed.md).
- Build plan, milestones and gates: [PLAN.md](PLAN.md). Read it before starting any story.

## Status

No code and no git repo yet. Next story: M1.1 (workspace scaffold + Typia proof). When M1.1 lands, replace the "planned" Layout and Commands below with the real ones.

## Layout (planned)

```
apps/worker/       Hono API Worker (D1, KV, cron, rate-limit DO, Jev client)
apps/web/          Vite + React, served by a web Worker with static assets
packages/contract/ shared plain TS types with Typia tags
docs/              jev-budget.md, gate reviews, deploy-cloudflare.md
blocked.md         written only when a story is stuck
```

## Commands (planned, mirror rx-jev — not yet created)

```bash
make -j2 dev    # worker :8787 + Vite :5173 with /api proxied
make test       # npm test --workspaces
make lint       # biome format:check + oxlint + typecheck
make db-local   # wrangler d1 migrations apply DB --local
make deploy     # API Worker, then web Worker
make smoke URL=https://trialscout.cc
```

## Stack

- TypeScript strict; npm workspaces; Biome (format) + oxlint (lint).
- API: Hono on Cloudflare Workers; routes validated with `@hono/typia-validator`; web calls the API through `hc<AppType>` (typed RPC).
- Client: Vite + React served by a web Worker with static assets, `run_worker_first: ["/api/*"]`, service binding `API` → API Worker. Not Cloudflare Pages.
- Data: D1 + Drizzle (trials, sites, criteria, GeoNames cities); KV `CACHE` (Jev verdicts). No raw SQL.
- Rate limit: Durable Object `SEARCH_LIMITER` (per IP). Daily cron refreshes cached trials.
- Data source: ClinicalTrials.gov API v2.
- AI: Jev via `@typesafe-ai/sdk` (`systemOne`, `Choice` questions) is the only AI component. Env: `TYPESAFE_API_KEY` (secret), `TYPESAFE_MODEL`.
- Errors: RFC 7807 Problem Details, `application/problem+json`.
- No auth provider.

## Project overrides of global rules

- **Typia, not Zod — everywhere.** This deliberately overrides the global "Zod for all external data" rule. Do not introduce Zod or revert this. Typia validates ClinicalTrials.gov responses, Jev responses, request bodies, the profile form and env vars, on both client and Worker.
  - Constraints are Typia type tags on plain TS types; validators are generated at compile time.
  - `unplugin-typia` must run in the web Vite build, the Worker build and Vitest. M1.1 must prove this before anything else.
  - Typia has no coercion/transforms — normalisation lives in plain functions.
  - Typia versions are tied to TypeScript versions; pin both together.

## Workflow

- `git init` before M1.1. Work on `task/<slug>`, `milestone/<slug>` or `gate/<slug>` branches, never `main`.
- One commit per passing story, prefixed with its ID: `M1.6: criteria splitter`.
- Max 3 fix cycles per story, then write `blocked.md` and stop.
- Stop at every `GATE` in PLAN.md until a human signs off.
- When a PLAN.md open question is answered (e.g. by the M1.3 Jev spike), update PLAN.md in the same commit.

## Testing

- TDD: write tests first; never change assertions to make them pass.
- Vitest: `@cloudflare/vitest-pool-workers` for the Worker, jsdom + Testing Library for web.
- Vitest must load `unplugin-typia`; without the transform, `typia.*` calls throw at runtime.
- No live network in tests: Jev is faked, and Jev and ClinicalTrials.gov responses are replayed from recorded fixtures.
- Pure functions (criteria splitter, verdict mapping, ranking) get table-driven tests against real eligibility texts.

## Porting from rx-jev

Port these from `/Users/tushar/Work/Projects/rx-jev`, swapping Zod for Typia:

- `apps/worker/src/problems.ts`: Problem Details helpers.
- `apps/worker/src/services.ts` and `judge.ts`: `TypeSafeClient` setup, request splitting and answer checks.
- The `AskLimiter` Durable Object and `wrangler.jsonc` layout.
- `.demo-caution` in `apps/web/src/App.tsx` and `index.css`. rx-jev has no print styles, so add `@media print` here.
- `test/jev.ts` and `test/recorded.ts`: fake Jev and fixture replay.

## Non-negotiable product rules

These are the safety mechanism. Every change must preserve them.

- Permanent, non-dismissible red disclaimer strip on every page **and every printed sheet**, exact copy:
  `Demo project. Not medical advice. AI picks these quotes from ClinicalTrials.gov and no clinicians have verified them.`
- Every verdict is shown next to the verbatim source criterion text it was judged against.
- Missing profile information → `ask your doctor`. Never an assumed pass or fail.
- Verdicts are exactly: `likely meets`, `likely fails`, `ask your doctor`.
- Never use "eligible", "qualify" or "match" as a promise. Use "worth discussing with your doctor".
- A false `likely fails` is the worst failure mode: rank such trials down, never remove them.
- No patient data stored server-side; profiles are used for scoring and discarded. No request-body logging, no analytics that capture profile contents. Profile lives only in browser `sessionStorage`. KV values hold verdicts only.
- Medical terms appear only inside quoted source text; UI copy is ~8th-grade reading level.

## Jev call budget

- Hard filters (condition, recruiting status, age, sex, distance) run before Jev sees a trial.
- At most ~300 Jev calls per search; exclusions judged first; after a confident fail, remaining criteria are "not checked yet" and judged when the trial is opened.
- Criteria splitting is deterministic (no AI), runs once per trial version and is cached in D1.
- Jev verdicts are cached in KV keyed by hash(model, criterion text, normalised profile).
- M1.3 confirms Jev's API shape, batching, pricing and billing unit from live TypeSafe docs (use the `typesafe-ai` skill) and records them in `docs/jev-budget.md`.

## Edge cases to handle

- Unsplittable/malformed eligibility section → show raw text with `ask your doctor`.
- Zero trials after hard filters → say which filter to relax (distance, stage).
- Rate limit or Jev budget hit → calm "try again later" state.
- ClinicalTrials.gov down → serve cached trials with a "data as of" date.

## Design

- Calm, plain-spoken; the red strip is the only loud element. Warm neutral background, one restrained accent.
- No clinical medical blue, no stock doctor photos, no gamification or cheerful illustrations.
- Verdict states distinguishable without colour (icon + label).
- WCAG AA, readable on a phone, single column on mobile.
- Motion only for loading and expanding criteria.
- Print stylesheet for the doctor sheet: clean black-and-white, disclaimer included.

## Out of scope

See product-seed.md "Out of Scope". Do not build accounts, alerts, other registries, uploads or non-oncology support without an explicit decision recorded in PLAN.md.
