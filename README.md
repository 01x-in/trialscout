# TrialScout

**A demo, not a medical product. It is not medical advice, and no clinician has checked its answers.**

TrialScout checks a patient's plain-language profile against the eligibility rules of recruiting cancer trials near them on [ClinicalTrials.gov](https://clinicaltrials.gov/), and shows each answer next to the trial's own words. Live at [trialscout.cc](https://trialscout.cc).

You describe the cancer (type, stage, age, sex, where you live, and anything else you know), and it:

1. asks ClinicalTrials.gov for the recruiting trials within your travel distance (it reads the first 100 it returns);
2. splits each trial's eligibility text into separate rules, with plain code and no AI;
3. asks [TypeSafe AI's Jev](https://docs.typesafe.ai/) one typed question per rule, within a fixed budget;
4. shows each rule as **likely meets**, **likely fails**, **ask your doctor** or **not checked yet**, next to the rule's exact quoted text, and ranks the trials.

It is a demo with a small budget, so a search does not check everything. See "How much a search checks" below.

## How much a search checks

- **Not every trial.** A search reads the first 100 trials ClinicalTrials.gov returns, which are not always the nearest. When there are more, the results say so. A smaller distance checks the nearest ones.
- **Not every rule at once.** Exclusion rules are judged first. After a confident "likely fails", the trial's remaining rules are left as "not checked yet". A search also asks at most 300 questions, in at most 30 requests, and any rules beyond that stay "not checked yet".
- **Opening a trial checks the rest.** It has its own budget, and the trial's counts update. A trial with rules still unchecked sits under "Not fully checked", never under "Nothing likely rules you out".
- **So no result is proof of anything.** A trial that is missing, or a rule that was not checked, is not a sign that nothing was missed. It is a reason to talk to a doctor.

## What it will and won't do

- Every verdict is shown next to the source text it was judged against.
- When the profile lacks the information, the answer is **ask your doctor**, with a question to take to the appointment. It never assumes a pass or a fail.
- A trial where something likely rules you out is listed last, not hidden. A false "likely fails" is the worst failure, so those trials are ranked down, never removed.
- It never says a patient is "eligible" or will "qualify". It shows trials that are worth discussing with a doctor.
- The red strip ("Demo project. Not medical advice. AI picks these quotes from ClinicalTrials.gov and no clinicians have verified them.") is on every page and every printed sheet.
- The profile is not stored. It lives in the browser tab (`sessionStorage`), and each check sends it to the server, which uses it and drops it. To do the check, parts of it go on to ClinicalTrials.gov (the condition as typed, your city's coordinates and the distance) and to Jev (cancer type, stage, age, sex and notes, never the place). Those services keep what they get under their own terms.
- The server does keep two short-lived things: Jev's answers for each trial, for up to 7 days, filed under a hashed key that holds no profile content; and your IP address with the times you searched, for up to a day, to limit how often one connection can search. See [docs/privacy.md](docs/privacy.md).

## Run it locally

You need Node 22.18 or newer (`.nvmrc` pins 24) and a TypeSafe API key.

```bash
npm install
make db-local            # local D1: migrations plus the GeoNames cities (downloads about 3 MB once)
echo 'TYPESAFE_API_KEY=your-key' > apps/worker/.dev.vars
make -j2 dev             # API Worker on :8787, web app on http://localhost:5173
```

Other commands:

```bash
make test                # worker tests, then web tests
make lint                # format check, oxlint and typecheck
make check-deploy        # build both Workers and dry-run the deploy
```

The first test run compiles Typia's Go plugin and takes a couple of minutes. Later runs use the cache. There is no live network in the tests: ClinicalTrials.gov and Jev answers are replayed from recorded fixtures in `fixtures/`.

## How it is built

| Part | Choice |
|---|---|
| `apps/worker` | Hono API on Cloudflare Workers, with D1 (Drizzle), KV for cached verdicts, a Durable Object rate limiter and a daily refresh cron |
| `apps/web` | Vite, React, Tailwind 4 and shadcn/ui, served by a second Worker that forwards `/api/*` to the API |
| `packages/contract` | shared types with [Typia](https://typia.io/) validation tags |
| Language and tools | TypeScript (strict), Biome, oxlint, Vitest |

Jev is the only AI component. It answers typed questions and cannot write text, so all wording in the interface is written by hand. The cost of a search is kept small: hard filters (condition, status, age, sex, distance) run before Jev sees a trial, and each search is capped at 300 questions. See [docs/jev-budget.md](docs/jev-budget.md).

More documentation:

- [PLAN.md](PLAN.md): the build plan and its human review gates.
- [docs/deploy-cloudflare.md](docs/deploy-cloudflare.md): deploying to Cloudflare, step by step.
- [docs/privacy.md](docs/privacy.md): what is stored and where.
- [docs/demo-script.md](docs/demo-script.md): how the demo video is recorded.

## Data and credits

- Trial data: [ClinicalTrials.gov](https://clinicaltrials.gov/) API v2, from the U.S. National Library of Medicine.
- Place names: [GeoNames](https://www.geonames.org/), under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- Rule checks: [Jev](https://docs.typesafe.ai/) by TypeSafe AI.

## License

[MIT](LICENSE).
