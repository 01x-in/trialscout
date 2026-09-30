# Deploying TrialScout to Cloudflare

TrialScout runs as two Workers:

- **`trialscout-api`**, the API Worker. It has no public URL (`workers_dev: false`) and uses these bindings:
  - D1 `DB`: saved trials, their split criteria, and GeoNames countries and cities;
  - KV `CACHE`: Jev verdicts, with no profile content;
  - the Durable Object `SearchLimiter` (`SEARCH_LIMITER`): the per-client search and trial-check limits;
  - a daily Cron Trigger at 03:17 UTC that refreshes saved trials (`src/refresh.ts`).
- **`trialscout-web`**, the web Worker. It serves the Vite build on `trialscout.cc` and passes `/api/*` to `trialscout-api` through the service binding `API`, so the site is one origin.

These safeguards keep it a demo and cap what it can cost:

- the red disclaimer strip on every page and printed sheet;
- per-client limits in the Worker: 5 searches a minute and 50 a day, and 20 trial checks a minute and 200 a day (`vars` in `apps/worker/wrangler.jsonc`);
- a Cloudflare rate-limiting rule on `/api/` (step 8);
- a spending cap on the TypeSafe account (step 7).

Run every command from the repository root unless a step says otherwise. Steps 1 to 9 are one-time setup.

## Before you start

- **GATE 1 and GATE 2 are signed off** (`docs/gate-1-review.md`, `docs/gate-2-review.md`). The site is public from step 9, so do not deploy before both reviews.
- **A Cloudflare account on the Workers Paid plan ($5 a month).** The Free plan allows 10 ms of CPU per request. Validating a page of ClinicalTrials.gov results and splitting every trial's criteria takes more than that.
- **`trialscout.cc` added to that Cloudflare account** as a zone, with its nameservers pointed at Cloudflare. Remove any existing DNS record for the bare `trialscout.cc` (a parking page, say): Wrangler creates the record itself in step 9 and stops if one is there.
- **Your TypeSafe API key.**
- **Node 22.18 or later** (`.nvmrc`), which runs the TypeScript tools in `apps/worker/scripts`, such as the smoke test, without a build step.
- **`npm install` done**, and `make test`, `make lint` and `make check-deploy` passing.

## 1. Log in to Cloudflare

```bash
npx wrangler login
```

This opens a browser for you to approve Wrangler. Check which account you are on:

```bash
npx wrangler whoami
```

## 2. Create the D1 database

```bash
cd apps/worker && npx wrangler d1 create trialscout
```

If Wrangler asks whether to add the database to your config, answer **no**. Saying yes adds a second entry with a new binding instead of filling in the existing `DB` entry.

Copy the `database_id` it prints into the existing `DB` entry in `apps/worker/wrangler.jsonc`:

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "trialscout",
    "database_id": "<paste here>",
    "migrations_dir": "migrations"
  }
],
```

## 3. Create the KV namespace

```bash
cd apps/worker && npx wrangler kv namespace create CACHE
```

Answer **no** again if Wrangler offers to add it to your config. Copy the `id` it prints into the existing `CACHE` entry:

```jsonc
"kv_namespaces": [{ "binding": "CACHE", "id": "<paste here>" }],
```

There should be one `d1_databases` entry and one `kv_namespaces` entry. Update the two comments above them, and commit both IDs on a `task/` branch. They are not secrets.

Local development keys its D1 by the ID once one is set, so run `make db-local` again afterwards.

## 4. Create the tables and import the cities

```bash
make db-remote
```

This applies the D1 migrations. It is safe to run again: migrations already applied are skipped.

```bash
make db-cities-remote
```

This imports GeoNames countries and cities of 15,000 people or more, the same data `make db-local` uses. It ends with:

```
Imported into remote D1
```

Run it once, now, while nothing is public. It empties the country and city tables and refills them in many batches, so a search made while it runs finds no city, and a failed run leaves the tables partly filled. If it fails, run it again until it ends as above. On a live site, re-run it only when the city data must change, at a quiet hour, followed by the smoke test.

The trial tables start empty and fill as people search.

## 5. Deploy the API Worker

```bash
cd apps/worker && npm run deploy
```

This builds the Worker with the Typia transform and deploys it. The first deploy also:

- creates the `SearchLimiter` Durable Object class (the `v1` migration in `wrangler.jsonc`), which needs no other setup;
- registers the daily Cron Trigger.

The Worker has no URL of its own, so nothing is public yet.

## 6. Add the secret

```bash
cd apps/worker && npx wrangler secret put TYPESAFE_API_KEY
```

Paste the key at the prompt. It never goes in a file or the repository.

`TYPESAFE_MODEL` stays pinned to `jev-1.13.0` in `wrangler.jsonc`. Changing it means re-running the GATE 1 sample first.

## 7. Set a spending cap on TypeSafe

The TypeSafe key pays for every Jev call. At [console.typesafe.ai](https://console.typesafe.ai/), set a monthly spending limit on the account that owns the key, and an alert below it.

A search costs about $0.003 in Jev input tokens ([jev-budget.md](jev-budget.md)), so $20 a month covers roughly 6,000 fresh searches. Cached verdicts cost nothing.

If the console offers only alerts and no hard limit, keep the account on prepaid credit, so usage stops when the credit runs out.

When the cap is reached, Jev calls fail. The API then answers 503, and the site says "We could not check trials right now. Please try again later." Nothing is assumed to pass or fail.

## 8. Add a rate-limiting rule

Do this before the site goes public in step 9. The Worker already limits each client, but this rule stops a script at Cloudflare's edge, before it reaches the Worker or Jev.

In the dashboard, open `trialscout.cc` and go to **Security**, then **Security rules**, then **Create rule**, then **Rate limiting rule**.

- **Name:** `trialscout api`.
- **If incoming requests match:** Field **URI Path**, Operator **starts with**, Value `/api/`.
- **With the same characteristics:** **IP**.
- **When rate exceeds:** 20 requests per 10 seconds. The Free plan allows only a 10-second period; on Pro and above, 60 requests per minute works too.
- **Then take action:** **Block**, for 10 seconds (the Free plan's duration), or longer on paid plans.
- **Deploy.**

A person makes one request per search and one per trial they open, so this leaves normal use untouched.

The rule covers only hostnames in the zone. That is why `apps/web/wrangler.jsonc` turns off the `workers.dev` and preview URLs: the site is reachable only on `trialscout.cc`.

## 9. Deploy the web Worker

```bash
cd apps/web && npm run deploy
```

This builds the app and deploys it on `https://trialscout.cc`, from the `routes` entry in `apps/web/wrangler.jsonc`. Wrangler creates the DNS record and the certificate; the certificate can take a few minutes the first time.

The site is public from this moment.

After this first launch, `make deploy` deploys both Workers, the API first. Do not use it for the first launch: it would publish the site before the secret, the spending cap and the rate-limiting rule are in place.

## 10. Smoke test

```bash
make smoke URL=https://trialscout.cc
```

It checks, with a made-up profile and no free-text notes:

- that the home and About pages load;
- that the app carries the exact disclaimer text, and that no print style hides it on the page or the doctor sheet;
- that a bad request gets a 422 Problem Details answer;
- the demo video, its poster and its captions are served, and the video answers a Range request with 206 (Safari will not play it otherwise);
- that one live search and one opened trial with split criteria work end to end.

It passes like this:

```
home page: ok
search page: ok
about page: ok
demo video: video, poster and captions are served; the video answers a Range request with 206
disclaimer: exact text in the app; the print styles keep it on the page and the doctor sheet
bad request: 422 Problem Details
search: 24 trials near Pune, live from ClinicalTrials.gov; 121 Jev questions in 18 requests, 30 from the cache
trial NCT06875310: 14 criteria, each next to its source text
Smoke test passed.
```

The counts and the trial change as ClinicalTrials.gov changes. The search is real: it costs well under a cent of Jev time and uses one of your 5 searches for the minute.

- If `search` says it **served saved trials**, ClinicalTrials.gov did not answer. Run the test again later.
- If it says **HTTP 503**, check the secret (step 6) and the TypeSafe spending cap (step 7).

Record the passing output in the M4 pull request.

## 11. Check the first refresh

The day after launch, in the dashboard, open **Workers & Pages**, then `trialscout-api`, then **Logs**. After 03:17 UTC there should be one line like this:

```
Trial refresh: checked 240, changed 3, removed 1
```

The numbers depend on how many trials searches have saved. While there, check the CPU time of `POST /api/search` requests under **Metrics**. This answers the PLAN.md open question on whether large ClinicalTrials.gov pages fit the Worker's CPU budget.

The logs hold fixed text, counts and error kinds only, and invocation logs are off ([privacy.md](privacy.md)).

## Updating

```bash
make check-deploy
```

```bash
make deploy
```

When a change adds a D1 migration, run `make db-remote` (migrations only; it leaves the city tables alone) before `make deploy`, so the new code never runs against the old schema. For the minute in between, the old code runs against the new schema, so a migration that drops or renames something the running code reads needs two deploys: first code that no longer reads it, then the migration.

Run `make smoke URL=https://trialscout.cc` after every deploy.

## Rolling back

Each Worker keeps its recent versions. To go back one version:

```bash
cd apps/web && npx wrangler rollback
```

```bash
cd apps/worker && npx wrangler rollback
```

D1 can be restored to any minute in the last 30 days (the Paid plan's Time Travel window):

```bash
cd apps/worker && npx wrangler d1 time-travel restore trialscout --timestamp=<unix seconds>
```

The KV verdict cache needs no rollback: its keys include the model and `QUESTION_VERSION`, so answers from other wording or another model are never reused.

## Local development

1. Put the key in `apps/worker/.dev.vars`, which Git ignores:

   ```
   TYPESAFE_API_KEY=...
   ```

2. Create the local D1 and import the cities (once):

   ```bash
   make db-local
   ```

3. Run the API Worker on :8787 and Vite on :5173:

   ```bash
   make -j2 dev
   ```

To smoke-test the production build locally, run the API Worker, then serve the web build on :4173. `vite preview` passes `/api` to :8787 as the dev server does.

```bash
make dev-worker
```

```bash
cd apps/web && npm run build && npx vite preview --port 4173
```

```bash
make smoke URL=http://localhost:4173
```

## Costs and limits

- **Workers Paid: $5 a month.** That includes 10 million requests, D1 and KV allowances well beyond a demo, and Durable Objects.
- **D1:** the GeoNames tables are a few MB, and each saved trial a few KB, against a 10 GB limit.
- **KV:** one key per trial and phase for each distinct profile, holding verdicts only.
- **Durable Objects:** one small object per client address. An alarm deletes its storage once its longest limit window has passed.
- **Jev:** about $0.003 per fresh search, and nothing for cached verdicts. The account's real limit is 1,200 requests a minute, shared by every visitor; see [jev-budget.md](jev-budget.md). Change the per-client limits in the `vars` of `apps/worker/wrangler.jsonc`.
