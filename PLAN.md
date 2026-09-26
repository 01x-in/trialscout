# TrialScout Plan

## Product

TrialScout (trialscout.cc) reads a patient's plain-language profile, checks it against every eligibility criterion of recruiting solid-tumour oncology trials on ClinicalTrials.gov using TypeSafe AI's Jev, and shows which trials are worth raising with a doctor. Each criterion is quoted from the source. It is a public demo and a sibling of rxjev.cc, not a medical product.

Scope source of truth: [product-seed.md](product-seed.md). If this plan and the seed disagree, the seed wins unless this plan records a deliberate deviation.

Hosting decision (2026-09-26): the client is served by Cloudflare Workers static assets (as rxjev.cc does), not Cloudflare Pages. The seed has been updated to match.

## Non-goals

See the seed's "Out of Scope". In short: no accounts, saved searches or saved profiles, no alerts, no non-oncology conditions, no registries other than ClinicalTrials.gov, no record/PDF uploads, no contacting sites, no clinician review, no native apps, no payments, English only.

## How a verdict is produced

### Pipeline

```
profile (browser session only)
  → hard filters (ClinicalTrials.gov query + age/sex/distance in code)
  → criteria split (deterministic, cached per trial in D1)
  → Jev judges each (profile, criterion) pair (cached in KV)
  → verdict mapping (likely meets / likely fails / ask your doctor)
  → ranking
```

### Hard filters

- Query ClinicalTrials.gov API v2 live with `query.cond`, `filter.overallStatus=RECRUITING` and `filter.geo=distance(lat,lon,Nmi)`.
- Apply age and sex from `eligibilityModule` (`minimumAge`, `maximumAge`, `sex`) in code.
- Resolve city to lat/lon from a GeoNames cities table in D1. No third-party geocoder sees profile data.
- Compute the nearest site distance with haversine over the trial's site coordinates.
- If zero trials survive, say which filter to relax (distance, stage).

### Criteria split

- A deterministic parser splits `eligibilityCriteria` into individual inclusion and exclusion lines. It uses no AI, because Jev is the only AI component.
- Split once per `nctId + lastUpdatePostDate` and store in D1 for all users.
- If a trial's eligibility text is malformed or can't be split, show the raw text with `ask your doctor`.

### Jev

- Use one `systemOne` request per trial, split by whole questions if a request is too large (the rx-jev pattern).
- `state` holds the normalised profile plus trial context (condition, phase).
- Each inclusion criterion is a `Choice` question with the options `meets`, `does_not_meet`, `not_enough_information` and `not_applicable`. `not_applicable` is for criteria that only cover another cohort, such as another cancer type or the other sex.
- Phrase exclusion criteria positively ("does it describe this patient?"), with the options `applies`, `does_not_apply`, `not_enough_information` and `not_applicable`. The mapping inverts them, so `applies` becomes `likely fails`.
- The exact wording, the measured costs and the starting thresholds are in [docs/jev-budget.md](docs/jev-budget.md).

### Verdict mapping

| Jev answer | Confidence | Verdict |
|---|---|---|
| `meets` (inclusion) / absent (exclusion) | ≥ threshold | likely meets |
| `does_not_meet` (inclusion) / present (exclusion) | ≥ threshold | likely fails |
| `not_applicable` | ≥ threshold | not counted |
| `not_enough_information` | any | ask your doctor |
| any | < threshold | ask your doctor |

Missing information never produces a guessed pass or fail. The starting thresholds are asymmetric: 0.90 for fails, 0.80 otherwise. GATE 1 sets the real ones.

### Ranking

This is a pure function.

1. Trials with no `likely fails` rank above trials with any. Failing trials sink but are never removed.
2. Within each tier, fewer `ask your doctor` verdicts rank first.
3. After that, shorter distance to the nearest site ranks first.

### Budget

- Hard filters run before Jev sees any trial.
- A search makes at most 300 Jev questions and 30 requests. Billing is per input token, and the real limit is the account's 1,200 requests per minute (M1.3).
- Exclusion criteria are judged first. After a confident `likely fails`, the trial's remaining criteria are marked "not checked yet" and judged only when the user opens that trial.
- The KV cache key is a hash of (the model version Jev reports, criterion text, normalised profile). `TYPESAFE_MODEL` is pinned to `jev-1.13.0` in production. The stored value is the verdict only, never raw profile content.
- A Durable Object rate limiter applies a per-IP limit.

### Wording

- Disclaimer strip copy, exact and on every page and every printed sheet: "Demo project. Not medical advice. AI picks these quotes from ClinicalTrials.gov and no clinicians have verified them."
- Never say "eligible", "qualify" or "match" as a promise. Say "worth discussing with your doctor".
- UI copy stays at about an 8th-grade reading level. Medical terms appear only inside quoted source text.

## Architecture

```
apps/
  worker/          Hono API Worker: D1, KV, cron, rate-limit DO, Jev client
    src/
    migrations/    Drizzle migrations
    test/          Vitest (pool-workers), faked Jev, recorded fixtures
  web/             Vite + React, served by a web Worker with static assets
packages/
  contract/        shared plain TS types with Typia tags
docs/              jev-budget.md, gate reviews, deploy-cloudflare.md
Makefile           dev / test / lint / db-local / deploy / smoke
```

- **Bindings** (API Worker): `DB` (D1), `CACHE` (KV), `SEARCH_LIMITER` (Durable Object), a daily cron trigger. The web Worker uses `run_worker_first: ["/api/*"]` and forwards through the service binding `API`.
- **Types:** the API Worker exports Hono `AppType`, and the web app calls it through `hc<AppType>` (typed RPC). Request bodies are validated with `@hono/typia-validator`.
- **Typia:** `ttsc` + `@ttsc/unplugin` run the transform in the web Vite build, in the API Worker's Vite build (`@cloudflare/vite-plugin`) and in Vitest. There is no Zod anywhere.
  - Toolchain decision (2026-09-26, M1.1): `@ryoppippi/unplugin-typia`, which the seed named, is deprecated on npm with a "contact support" notice, and Typia's README now points to `@ttsc/unplugin`. Pinned together: TypeScript 7.0.2, typia 15.0.0, ttsc and `@ttsc/unplugin` 0.30.4. The seed has been updated to match.
- **Errors:** RFC 7807 Problem Details with `application/problem+json`, ported from rx-jev `apps/worker/src/problems.ts`.
- **Privacy:** the profile exists only in the request body and browser `sessionStorage`. It is never logged, never persisted and never sent to analytics.

## Milestones

### M1 Profile to ranked list

- M1.1 Workspace scaffold and Typia proof: npm workspaces, Biome, oxlint, Makefile. One Typia-tagged type is validated in a Hono route (`@hono/typia-validator`), in the web form, and in Vitest (pool-workers and jsdom). `wrangler deploy --dry-run` passes for both Workers. If this fails, write `blocked.md` and stop.
- M1.2 Typia env validation. Port `problems.ts` to Typia.
- M1.3 Jev spike: read the live TypeSafe docs and confirm request shape, batching, pricing, the billing unit, and whether Jev can produce text. Record real responses as fixtures. Write `docs/jev-budget.md`.
- M1.4 ClinicalTrials.gov v2 client with Typia types for the payload subset used. Record fixtures.
- M1.5 Drizzle schema and migrations for `trials`, `sites`, `criteria` and `cities`, plus a GeoNames import script.
- M1.6 Criteria splitter: pure function, TDD against about 30 real eligibility texts, including malformed ones.
- M1.7 Hard filters, plus a zero-result explanation that names the filter to relax.
- M1.8 Jev judge: question phrasing, verdict mapping, threshold, KV cache, budget cap and early exit.
- M1.9 Ranking function: pure, TDD.
- M1.10 `POST /api/search` with the `SEARCH_LIMITER` DO. Rate-limit and budget hits return Problem responses.
- M1.11 Web:
  - disclaimer strip
  - guided profile form (sessionStorage only)
  - result cards showing title, phase, sponsor, nearest site with distance, and summary counts
  - empty, rate-limited and error states

**Definition of done:** run `make -j2 dev`, fill in the form, and see a ranked list with verdict counts under the red strip.

### GATE 1 Verdict review

A human checks the verdicts for 3 sample profiles across about 10 real trials each, focusing on:
- false `likely fails`
- `ask your doctor` whenever information is missing
- quote fidelity

The review sets the confidence threshold and is recorded in `docs/gate-1-review.md`. No M2 work starts before sign-off.

### M2 Trial checklist and doctor sheet

- M2.1 `GET /api/trials/:nctId/verdicts` returns every criterion with its verdict, confidence and verbatim text. It judges "not checked yet" criteria on demand.
- M2.2 Checklist UI: verdicts shown with icon and label, readable without colour. Motion is used only for expanding.
- M2.3 "Ask your doctor" criteria become plain questions, written from templates in code. M1.3 confirmed Jev cannot generate text.
- M2.4 Printable "Questions for your doctor" sheet with a `@media print` stylesheet: black and white, disclaimer printed, trial ID and official link.
- M2.5 Edit the profile and re-run the search without re-entering it. Every trial links to its official ClinicalTrials.gov page.

### M3 Resilience, accessibility, privacy

- M3.1 Daily cron refreshes cached trials with a cursor and re-splits trials that changed.
- M3.2 When ClinicalTrials.gov is unavailable, serve cached trials with a "data as of" date.
- M3.3 "About this demo" page: how matching works, what Jev is, the method's limits, and why no clinician has verified the results. Credit GeoNames (CC BY 4.0) for city data.
- M3.4 WCAG AA pass: axe in tests, keyboard navigation, contrast, phone layout.
- M3.5 Privacy audit: no body logging, no profile analytics, KV values hold verdicts only.

### GATE 2 Wording and safety review

- Check for banned words ("eligible", "qualify", "match").
- Confirm the disclaimer strip is on every page and every printed sheet.
- Check the reading level.
- Confirm no verdict appears without its source quote.

Record the result in `docs/gate-2-review.md`.

### M4 Launch

- Write `docs/deploy-cloudflare.md` covering D1, KV, secrets, the Durable Object, the Cloudflare rate-limit rule, the TypeSafe spending cap and the trialscout.cc domain.
- Run `make smoke URL=…` against production.

## Open questions

- ~~What billing unit does the 300-per-search Jev budget count?~~ Answered in M1.3 ([docs/jev-budget.md](docs/jev-budget.md)): billing is per input token (jev-1.13: $0.042/Mtok, output free), so a search costs about $0.003. The binding limit is the account rate limit (1,200 requests/min), so M1.8 caps each search at 300 questions and 30 requests.
- ~~Can Jev produce plain-language text for M2.3?~~ No, Jev returns typed answers only. M2.3 uses templates.
- How should multi-cohort trials be handled? `not_applicable` fixes "For melanoma: …" criteria, but "NSCLC and cutaneous melanoma" is still read literally as a false `likely fails` (0.98). Review at GATE 1.
- Do criteria with numeric thresholds or date windows need to be forced to `ask your doctor`? Jev is weak at math and dates. Review at GATE 1.
- Should KV cache keys be narrowed to only the profile fields relevant to each criterion, to raise the hit rate?
- ~~Is cancer stage a hard filter?~~ No (M1.7). ClinicalTrials.gov has no structured stage field, so Jev judges stage criteria and a mismatch shows as `likely fails`. The trial is ranked down, never removed. Zero-result hints therefore only suggest a larger distance.
- Do large ClinicalTrials.gov result pages fit the Worker CPU budget, or does paging need a queue?
