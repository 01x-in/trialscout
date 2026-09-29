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
  - Decision (2026-09-28, UI facelift): the form offers female, male and other. For "other", a trial limited to one sex is kept, not removed: it would be an assumed fail. Its card says "ClinicalTrials.gov lists this trial for female/male patients only. Ask your doctor whether it could include you." Jev gets `sex: other`. Check a sample of "other" profiles at GATE 1, including how Jev reads sex-specific rules such as pregnancy.
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

1. Trials with no `likely fails` rank above trials with any. Among failing trials, fewer fails rank first. Failing trials sink but are never removed.
2. Within each tier, a smaller share of unknown criteria ranks first. Unknown means `ask your doctor` or "not checked yet". It is a share of the trial's counted criteria, so short trials don't win by having fewer criteria, and an unjudged trial never tops the list.
3. After that, the nearer recruiting site ranks first, with unknown distance last. The NCT ID breaks exact ties.

### Budget

- Hard filters run before Jev sees any trial.
- A search makes at most 300 Jev questions and 30 requests. Billing is per input token, and the real limit is the account's 1,200 requests per minute (M1.3).
- Exclusion criteria are judged first. After a confident `likely fails`, the trial's remaining criteria are marked "not checked yet" and judged only when the user opens that trial.
- KV caches Jev's answers per trial and phase (all of a trial's exclusions, or all its inclusions). The key is a SHA-256 of the model, `QUESTION_VERSION`, the trial context, those criteria, and the normalised profile fields Jev reads; city, country and distance are left out. The value is the answers plus the model Jev reported, never profile content. It expires after 7 days. `TYPESAFE_MODEL` is pinned to `jev-1.13.0` in production.
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

- M2.1 `POST /api/trials/:nctId/verdicts` returns every criterion with its verdict, confidence and verbatim text. It judges "not checked yet" criteria on demand. It is a POST because the profile must travel in the body, never in a URL. Checks are rate limited per client apart from searches (`TRIAL_CHECKS_PER_MINUTE`, `TRIAL_CHECKS_PER_DAY`), and only checks that reach Jev count.
- M2.2 Checklist UI: verdicts shown with icon and label, readable without colour. Motion is used only for expanding.
- M2.3 "Ask your doctor" criteria become plain questions, written from templates in code. M1.3 confirmed Jev cannot generate text.
- M2.4 Printable "Questions for your doctor" sheet with a `@media print` stylesheet: black and white, disclaimer printed, trial ID and official link.
- M2.5 Edit the profile and re-run the search without re-entering it. Every trial links to its official ClinicalTrials.gov page.

### M3 Resilience, accessibility, privacy

- M3.1 Daily cron refreshes cached trials with a cursor and re-splits trials that changed.
- M3.2 When ClinicalTrials.gov is unavailable, serve cached trials with a "data as of" date.
  - Saved recruiting trials are matched offline by the telling words of the condition as typed ("non-small cell lung" of "non-small cell lung cancer"), since ClinicalTrials.gov's synonym expansion is not available. The hard filters and Jev then run as usual, so a loose candidate shows as a likely fail, never a promise.
  - A live search saves every recruiting trial it fetches, not only those that fit its patient, so the saved copy serves other patients too. The fallback reads saved matches in pages of 300 (up to 5) and applies the hard filters to each page, so trials far away cannot crowd out near ones.
  - "Data as of" is the oldest `checked_at` among the trials shown. If nothing saved fits, the search still answers a calm 502 rather than an empty list that would suggest nothing recruits nearby.
- M3.3 "About this demo" page: how matching works, what Jev is, the method's limits, and why no clinician has verified the results. Credit GeoNames (CC BY 4.0) for city data.
- M3.4 WCAG AA pass: axe in tests, keyboard navigation, contrast, phone layout.
- M3.5 Privacy audit: no body logging, no profile analytics, KV values hold verdicts only.

### GATE 2 Wording and safety review

- Check for banned words ("eligible", "qualify", "match").
- Confirm the disclaimer strip is on every page and every printed sheet.
- Check the reading level.
- Confirm no verdict appears without its source quote.
- Review the doctor-sheet questions (`apps/web/src/questions.ts`), changed on 2026-09-27 after live checks picked the wrong topic:
  - Two new questions: "This rule is about the stage of the cancer. Does my stage meet it?" and "This rule is about other health problems I may have. Does it apply to me?"
  - Topic order changed. Past-treatment words ("prior", "received", "progression on") now decide before the stage and the spread; "metastatic setting" and "prior to randomization" no longer count; spread to the brain or spine still comes first.
  - Against the 2,539 rules saved by that day's searches, 317 got a different question. Check a sample of them, as well as the four reported cases in `questions.test.ts`.
- Review the copy the UI facelift (01x-in/trialscout#6) added:
  - the search page's heading, "Check trials near you" (since 2026-09-29 the intro sentence sat there; it moved to the landing page, so the page says what it does once);
  - the form section headings: "About the cancer", "About you", "Where you are", "Anything else (optional)";
  - the notes line "Stays in this browser tab. We don't store it.";
  - the privacy note above "Find trials" ("We don't store your answers…", linking to the About page), and the About page's list of the two things kept for a short time (cached Jev answers for 7 days, internet address and search times for a day);
  - the results headings "Nothing likely rules you out" (only for trials with every rule checked), "Not fully checked", "Rules we could not read" (note: "We could not turn these trials' rules into a checklist. Ask your doctor about them.") and "Something likely rules you out", and their notes "The search found nothing that likely rules you out, but it did not check every rule of these trials. Opening a trial checks the rest." and "Listed last, not hidden. A likely fail can be wrong: your doctor can check it.";
  - the filter chips ("All", "Ask your doctor", "Likely fails", "Likely meets", "Not checked yet"), "None of these rules." and "Showing n of m rules.";
  - the sex choice "Female / Male / Other", its error "Choose female, male or other.", and the card note for "other" on a single-sex trial;
  - the distance quick picks after "Or choose:", and "Any distance" (the field shows those words; it means no distance limit), the summary's "at any distance from …", and its note when ClinicalTrials.gov lists more trials than a search reads ("We checked the first 100 it gave us, which are not always the nearest. Choose a smaller distance to check the nearest ones.");
  - "Official page", and the card line "Checking every rule found something that likely rules you out." shown when opening a trial finds a likely fail the search did not.
- The Tailwind and shadcn/ui restyle (2026-09-28) adds no new copy. The "About this demo" link moves from the footer to a header, which the disclaimer strip still sits above on every page. Confirm the strip still reads as the loudest thing on the page, in light and dark, and on a phone, where the strip and header stay in view together.
- The landing page (2026-09-29): `/` is now a landing page and the search moved to `/search`, split in thirds on a wide screen (form left, results right). Review its copy:
  - the heading "Which cancer trials are worth asking your doctor about?" and the line under it ("Tell us about the cancer in plain words. TrialScout checks every rule of the recruiting trials near you on ClinicalTrials.gov, and shows each answer next to the trial's own words.");
  - "Try it now", in the header, the hero and the close;
  - the video caption "A two-minute demo with a made-up patient." and the video's captions (`apps/web/public/demo/captions.vtt`, the same words as the voice-over, which says "prototype" and "not medical advice");
  - the three steps ("Tell us about the cancer", "We check every rule of nearby recruiting trials", "Take your questions to your doctor");
  - "Built to be careful" and its four cards: "Every answer quotes the trial", "It says "ask your doctor"", "Listed last, not hidden" ("Trials where something likely rules you out stay on the list, at the end. The AI can be wrong."), "Nothing is stored";
  - the close, "A demo, not medical advice. No doctor has checked its answers.";
  - the empty-results hint beside the form: "Trials worth discussing with your doctor will show here, each rule next to the trial's own words.";
  - the strip is still the first thing on the page, on the landing page and on a phone.
- The theme switch (2026-09-28) in the header: a sun or moon button whose screen-reader name is "Switch to light theme" or "Switch to dark theme". It remembers the pick in `localStorage` (`trialscout.theme`), which holds nothing else; see docs/privacy.md.

Record the result in `docs/gate-2-review.md`.

### M4 Launch

- M4.1 `make smoke URL=…`: with a made-up profile, check the home, search and About pages, the demo video (which must answer a Range request with 206), the exact disclaimer in the app bundle and its print styles, a 422 Problem Details for a bad request, and one live search and opened trial end to end. Tested against the real API with recorded trials, and run against a local production build.
  - The disclaimer text moved to `@trialscout/contract`, so the smoke test checks the same string the app renders.
- M4.2 `docs/deploy-cloudflare.md` covering D1, KV, secrets, the Durable Object, the Cloudflare rate-limit rule, the TypeSafe spending cap and the trialscout.cc domain; `make db-remote` for the deployed D1.
  - The web Worker is served only on `trialscout.cc` (`workers_dev: false`), so nothing gets around the zone's rate-limiting rule.
- Human, after GATE 1 and GATE 2: follow the guide, then run `make smoke URL=https://trialscout.cc` and record its output.

## Open questions

- ~~What billing unit does the 300-per-search Jev budget count?~~ Answered in M1.3 ([docs/jev-budget.md](docs/jev-budget.md)): billing is per input token (jev-1.13: $0.042/Mtok, output free), so a search costs about $0.003. The binding limit is the account rate limit (1,200 requests/min), so M1.8 caps each search at 300 questions and 30 requests.
- ~~Can Jev produce plain-language text for M2.3?~~ No, Jev returns typed answers only. M2.3 uses templates.
- How should multi-cohort trials be handled? `not_applicable` fixes "For melanoma: …" criteria, but "NSCLC and cutaneous melanoma" is still read literally as a false `likely fails` (0.98). Review at GATE 1.
- Do criteria with numeric thresholds or date windows need to be forced to `ask your doctor`? Jev is weak at math and dates. Review at GATE 1.
- Should KV cache keys be narrowed further, to the profile fields each criterion needs? M1.8 already leaves out location and distance, and keys per trial and phase to keep KV operations low. This is not worth it until real hit rates are known.
- How should `not_applicable` criteria show on the M2 checklist? They are left out of the counts, and CLAUDE.md allows exactly three verdicts. For now (M2.2) they are listed apart under "Rules for other groups of patients", quoted with no verdict label and a note that the doctor can confirm; they are left off the doctor sheet. Confirm or change this at GATE 2.
- ~~Is cancer stage a hard filter?~~ No (M1.7). ClinicalTrials.gov has no structured stage field, so Jev judges stage criteria and a mismatch shows as `likely fails`. The trial is ranked down, never removed. Zero-result hints therefore only suggest a larger distance.
- Do large ClinicalTrials.gov result pages fit the Worker CPU budget, or does paging need a queue? The deploy guide requires Workers Paid (30 s of CPU per request by default, against the Free plan's 10 ms), and its step 11 checks the CPU time of real searches after launch.
