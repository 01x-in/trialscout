# TrialScout

Public demo (trialscout.cc) that checks a patient's plain-language profile against every eligibility criterion of recruiting oncology trials on ClinicalTrials.gov, using TypeSafe AI's Jev. Sibling of rxjev.cc. **A demo, not a medical product.**

- Scope source of truth: [product-seed.md](product-seed.md).
- Build plan, milestones and gates: [PLAN.md](PLAN.md). Read it before starting any story.

## Status

M1 to M4, the UI facelift, its Tailwind and shadcn/ui restyle, and the landing page with the split search are built. Both Workers were first deployed to trialscout.cc on 2026-09-28, but the site is not announced yet. The GATE 1 verdict review (`docs/gate-1-review.md`) and the GATE 2 wording and safety review (`docs/gate-2-review.md`) are still owed, since M2 to M4 were built at the user's request before them. Announcing the site waits for both; later deploys follow the "Later updates" steps below.

## context-mode (mandatory)

Always route work through the context-mode MCP tools so raw output never floods the context window. This follows [context-mode's Claude Code rules](https://github.com/mksglu/context-mode/blob/main/configs/claude-code/CLAUDE.md).

- **Think in code.** To analyse, count, filter, compare or parse data, write a script with `ctx_execute(language, code)` and `console.log()` only the answer. Use JavaScript with Node built-ins, wrap it in `try/catch`, and handle `null`.
- **Blocked:**
  - `curl`, `wget`, WebFetch and inline HTTP in Bash. Use `ctx_fetch_and_index(url, source)` then `ctx_search`, or `fetch()` inside `ctx_execute`. This includes ClinicalTrials.gov and the TypeSafe docs.
- **Bash only for** `git`, `mkdir`, `rm`, `mv`, `cd`, `ls` and `npm install`. Anything that can print more than 20 lines goes through `ctx_batch_execute` or `ctx_execute`. In this repo that means:
  - `make test`, `make lint` and `make check-deploy`
  - `vitest`, `wrangler` and `npm ls` / `npm audit`
  - Filter these to the pass/fail lines.
- **Read only to Edit.** To explore or summarise a file, use `ctx_execute_file(path, language, code)`. This applies especially to `fixtures/jev/*.json`, `fixtures/ctgov/*.json` and `package-lock.json`, which are large.
- **Grep** through `ctx_execute` when results may be large.
- **Tool order:**
  1. On resume, check memory with `ctx_search(sort: "timeline")` before asking the user.
  2. Gather with `ctx_batch_execute(commands, queries)`.
  3. Follow up with `ctx_search(queries: [...])` in one call.
  4. Process with `ctx_execute` / `ctx_execute_file`.
  5. Fetch web pages with `ctx_fetch_and_index`.
  6. Store notes with `ctx_index`.
- **Parallel I/O:** pass `concurrency: 4–8` for network batches, such as several docs pages or several `npm view` or `gh` calls, and cap `gh` at 4. Keep `concurrency: 1` for CPU-bound or stateful commands (`make test`, builds, lint).
- **Output:** write artifacts to files, never inline, and reply with the path plus one line. Give indexed content descriptive `source` labels.
- **Files are written** with Write/Edit, never with `ctx_execute` or Bash.
- **Commands:**
  - `ctx stats` calls `ctx_stats`.
  - `ctx doctor` and `ctx upgrade` call their tool and run the returned command.
  - `ctx purge` wipes the knowledge base, so confirm before running it.

## Layout

```
apps/worker/       Hono API Worker, built by Vite + @cloudflare/vite-plugin (src/app.ts exports AppType;
                   tsconfig.rpc.json emits its declarations for the web app's hc<AppType>)
apps/web/          Vite + React; worker/index.ts is the web Worker serving dist/, forwarding /api/* and
                   answering Range requests for /demo/* (static assets ignore Range, and Safari needs it)
                   Pages by path: `/` landing (demo video in public/demo), `/search` (form left, results right from 1024px), `/about`.
packages/contract/ shared plain TS types with Typia tags (Profile)
docs/              jev-budget.md, privacy.md (audit; re-run when adding logs, storage or third parties),
                   gate reviews, deploy-cloudflare.md
blocked.md         written only when a story is stuck
```

## Commands

```bash
make -j2 dev       # API Worker (vite dev) :8787 + web Vite :5173 with /api proxied
make test          # worker (workerd pool) then web (jsdom)
make lint          # biome format:check + oxlint + typecheck (tsc 7)
make format        # biome format --write
make db-local      # local D1: migrations + GeoNames cities (downloads ~3 MB once)
make db-remote     # deployed D1: migrations only
make db-generate   # new Drizzle migration after editing apps/worker/src/db/schema.ts
make check-deploy  # vite build + wrangler deploy --dry-run for both Workers
make deploy        # API Worker, then web Worker
```

Run `make db-local` once before `make -j2 dev`, and put `TYPESAFE_API_KEY` in `apps/worker/.dev.vars`.

Node 22.18+ (`.nvmrc`): the tools in `apps/worker/scripts` run as `.ts` directly, with no build step.

- **First launch:** follow [docs/deploy-cloudflare.md](docs/deploy-cloudflare.md) step by step. It deploys the API Worker alone, then sets the secret, the TypeSafe spending cap and the rate-limiting rule before the web Worker makes the site public. Do not use `make deploy` for it.
- **Later updates:** `make db-remote` if there is a new migration, then `make deploy`, then `make smoke URL=https://trialscout.cc`. The smoke test makes one real search and trial check against live ClinicalTrials.gov and Jev; the guide shows how to run it locally.

## Stack

- TypeScript strict; npm workspaces; Biome (format) + oxlint (lint).
- API: Hono on Cloudflare Workers; routes validated with `@hono/typia-validator`; web calls the API through `hc<AppType>` (typed RPC).
- Client: Vite + React served by a web Worker with static assets, `run_worker_first: ["/api/*"]`, service binding `API` → API Worker. Not Cloudflare Pages.
- UI: Tailwind 4 (`@tailwindcss/vite`; theme in `src/index.css` under `@theme inline`, no config file) and shadcn/ui components in `src/components/ui`, imported through `@/`. Add them with the shadcn CLI (`components.json`: new-york, stone), then match the repo: `.ts`/`.tsx` import extensions, explicit return types, our solid focus ring, 44px controls.
  - Keep native controls where tests rely on the HTML: `<input type=radio>`, `<select>` (NativeSelect) and `<button aria-pressed>`, not Radix RadioGroup, Select or ToggleGroup.
  - Colour tokens stay 6-digit hex under our own names (`--bg`, `--fg`, `--muted` is text, `--accent` is teal) and are mapped to shadcn's names in `@theme inline`; shadcn's `accent` is the quiet hover ground, `primary` is our teal.
  - Plain CSS stays for class names something reads: `.demo-caution` and `.sheet-caution` (smoke test), print rules, `.chip` (a11y test), `.verdict-bar-*`, `.criterion-question` and the doctor sheet.
  - Geist comes from `@fontsource-variable/geist`, bundled into our own assets.
- Data: D1 + Drizzle (trials, sites, criteria, GeoNames cities); KV `CACHE` (Jev verdicts). No raw SQL.
- Rate limit: Durable Object `SEARCH_LIMITER` (per IP; an alarm deletes its state after the longest window). Daily cron (`src/refresh.ts`) refreshes saved trials; when ClinicalTrials.gov is down, searches serve saved trials (`source: 'saved'`).
- Data source: ClinicalTrials.gov API v2.
- AI: Jev via `@typesafe-ai/sdk` (`systemOne`, `Choice` questions) is the only AI component. Env: `TYPESAFE_API_KEY` (secret), `TYPESAFE_MODEL`.
- Errors: RFC 7807 Problem Details, `application/problem+json`.
- No auth provider.

## Project overrides of global rules

- **Typia, not Zod — everywhere.** This deliberately overrides the global "Zod for all external data" rule. Do not introduce Zod or revert this. Typia validates ClinicalTrials.gov responses, Jev responses, request bodies, the profile form and env vars, on both client and Worker.
  - Constraints are Typia type tags on plain TS types; validators are generated at compile time.
  - The transform runs through `ttsc` + `@ttsc/unplugin` (not the deprecated `@ryoppippi/unplugin-typia`) in the web Vite build, the Worker Vite build and both Vitest configs. The plugin is declared in `tsconfig.json` / `tsconfig.app.json` `compilerOptions.plugins`; a file outside that tsconfig's `include` is left untransformed.
  - Typia has no coercion/transforms — normalisation lives in plain functions.
  - Exact pins that must move together: `typescript` 7.0.2 (Go), `typia` 15.0.0, `ttsc` + `@ttsc/unplugin` 0.30.4. `@hono/typia-validator` declares typia ≤12, so the root `overrides` forces it onto typia 15 and `npm ls` reports it as invalid; that is expected.
  - The first Vitest/Vite run compiles typia's Go plugin (about 2 minutes); later runs use the cache.
  - The API Worker's `vite dev` runs with `server.watch: null`, because with a watcher, `@ttsc/unplugin` deadlocks the Cloudflare dev runner and every request hangs. Restart `make dev` after editing Worker code. The web app keeps hot reload.

## Workflow

- Work on `task/<slug>`, `milestone/<slug>` or `gate/<slug>` branches, never `main`.
- One commit per passing story, prefixed with its ID: `M1.6: criteria splitter`.
- Max 3 fix cycles per story, then write `blocked.md` and stop.
- Stop at every `GATE` in PLAN.md until a human signs off.
- When a PLAN.md open question is answered (e.g. by the M1.3 Jev spike), update PLAN.md in the same commit.

## Testing

- TDD: write tests first; never change assertions to make them pass.
- Vitest: `@cloudflare/vitest-pool-workers` for the Worker, jsdom + Testing Library for web.
- Vitest must load `@ttsc/unplugin`; without the transform, `typia.*` calls throw at runtime.
- The pool-workers package pins its own workerd, which caps `compatibility_date` (currently 2026-08-20). Do not raise the date past what it supports.
- No live network in tests: Jev is faked, and Jev and ClinicalTrials.gov responses are replayed from recorded fixtures.
- Pure functions (criteria splitter, verdict mapping, ranking) get table-driven tests against real eligibility texts.
- Accessibility: `apps/web/src/a11y.test.tsx` runs axe (WCAG 2.2 AA) on every page state. jsdom cannot measure contrast, so the test works it out from the `index.css` tokens; add any new colour token to its `PAIRS`.
- Privacy: `test/privacy.test.ts` (Worker) and `src/privacy.test.tsx` (web) fail if a profile reaches a log, D1, KV, a third-party asset or a URL.

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
- One `systemOne` request per trial, with every criterion as a Choice question. Cap each search at 300 questions and 30 requests. Exclusions are judged first. After a confident fail, the remaining criteria are "not checked yet" and are judged when the trial is opened.
- Billing is per input token (about $0.003 per search). The real limit is the account rate limit of 1,200 requests/min. See [docs/jev-budget.md](docs/jev-budget.md) for the measured costs, the exact question wording, the `not_applicable` option and the starting thresholds.
- Jev cannot generate text. Never use it to write copy, and never ask it to do arithmetic or compare dates.
- Criteria splitting is deterministic (no AI), runs once per trial version and is cached in D1.
- Jev answers are cached in KV per trial and phase. The key is a SHA-256 of the model, `QUESTION_VERSION`, the trial context, the criteria, and the normalised profile without location; the value holds no profile content. Bump `QUESTION_VERSION` (`apps/worker/src/judge/questions.ts`) whenever the wording changes. `TYPESAFE_MODEL` is pinned (`jev-1.13.0`), and changing it means re-running the GATE 1 sample.
- Re-run the spike with `cd apps/worker && node --env-file-if-exists=.dev.vars scripts/jev-spike.ts`. It sends only synthetic profiles to Jev.

## Edge cases to handle

- Unsplittable/malformed eligibility section → show raw text with `ask your doctor`.
- Zero trials after hard filters → say which filter to relax (distance, stage).
- Rate limit or Jev budget hit → calm "try again later" state.
- ClinicalTrials.gov down → serve cached trials with a "data as of" date.

## Design

- Calm, plain-spoken; the red strip is the only loud element. Warm stone neutrals, the Geist font, one restrained accent: deep teal (`--accent`), never a verdict colour, so no button reads as "ask your doctor".
- No clinical medical blue, no stock doctor photos, no gamification or cheerful illustrations.
- Verdict states distinguishable without colour (icon + label).
- WCAG AA, readable on a phone, single column on mobile. On `/search` from 1024px the form takes the left third, stays in view and scrolls on its own, and the results fill the right two thirds.
- Motion only for loading and expanding criteria.
- Print stylesheet for the doctor sheet: clean black-and-white, disclaimer included.

## Out of scope

See product-seed.md "Out of Scope". Do not build accounts, alerts, other registries, uploads or non-oncology support without an explicit decision recorded in PLAN.md.
