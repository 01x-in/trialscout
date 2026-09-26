# Jev budget and API shape (M1.3 spike)

Recorded 2026-09-26 from the live TypeSafe docs ([Models](https://docs.typesafe.ai/models.md), [API](https://docs.typesafe.ai/api.md), [Choice](https://docs.typesafe.ai/primitives/choice.md), [Jev 1.13 jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13.md)) and from real calls made by [scripts/jev-spike.ts](../apps/worker/scripts/jev-spike.ts). Every request and response is in [fixtures/jev/](../fixtures/jev/), and the two trials are in [fixtures/ctgov/](../fixtures/ctgov/). Both profiles are synthetic.

## API shape

- `POST /v1/systemone`, through `@typesafe-ai/sdk` 0.6.0: `client.systemOne({ state, questions, model })`.
- `questions` is a map from our id to a question. The id is never sent to the model, so each question carries its full meaning.
- A Choice answer is `{ type: 'choice', choice, probabilities: { option: p }, confidence }`. A Choice can have up to 255 options.
- The response carries the resolved `model` (`jev-latest` answered as `jev-1.13.0`) and `usage: { input_tokens, output_tokens }`.
- Errors: 401 (bad key), 422 (malformed request), 429 (rate limit), 529 (overloaded). By default the SDK retries 429 and 5xx with backoff and honours `retry-after`.

## Batching

- All questions in one request are judged in parallel against the `state`, which is read once. The docs' own cookbook measures one 13-question call as 12x cheaper and 10x faster than 13 single calls.
- Limits for jev-1.13 are 64k tokens per request (state plus all questions) and 32k for the state plus the single longest question.
- **Decision:** one request per trial, with every criterion of that trial as one Choice question. A trial with 100 criteria is about 21k tokens, well inside 64k. Split by whole questions only if a request would pass about 55k tokens (the rx-jev pattern).

## Pricing and the billing unit

- **Billing is per input token. Output tokens are free.** jev-1.13 costs $0.042 per million input tokens. There is no per-call or per-question charge.
- Measured on jev-1.13.0:

| Request | Questions | Input tokens | Latency |
|---|---|---|---|
| NCT06563999, sparse profile | 24 | 3,778 | 575 ms |
| NCT06563999, detailed profile | 24 | 3,854 | 358 ms |
| NCT07130032, detailed profile | 25 | 4,083 | 363 ms |
| NCT06563999, detailed profile, 1 question | 1 | 576 | 318 ms |
| NCT06563999, detailed profile, with `not_applicable` | 24 | 4,886 | 385 ms |
| NCT07130032, detailed profile, with `not_applicable` | 25 | 5,158 | 432 ms |

- A request costs about 430 fixed tokens (the state and overhead) plus about 145 tokens per criterion, or about 205 with the `not_applicable` option below.
- **A 300-question search is about 65k input tokens, about $0.003.** Money is not the constraint.
- **The binding constraint is the rate limit:** 1,200 requests per minute and 250,000 tokens per second, shared across the account. At about 12–25 requests per search, the whole demo tops out around 50–100 fresh searches a minute. The KV verdict cache, the early exit, and the per-IP `SEARCH_LIMITER` exist to stay under that, not to save money.
- **Budget rule for M1.8:** at most 300 questions **and** at most 30 requests per search, whichever comes first. Both counts are enforced in code and reported per search.

## Can Jev produce text?

No. The docs say Jev "is not trained to generate text"; it returns typed choices and probabilities. **M2.3 rewrites "ask your doctor" criteria into plain questions with templates in code**, not with Jev.

## Question design (decided for M1.8)

- **State:** `{ patient: { cancer, stage, age, sex, notes? }, trial: { title, conditions } }`. Keep it small, because unrelated detail lowers accuracy (jaggedness: "Large state full of irrelevant detail"). No city, country or distance goes to Jev.
- **Inclusion criterion:** "A clinical trial requires this of every participant: "…". Going only by what `patient` says, does this patient meet the requirement?". Options:
  - `meets`
  - `does_not_meet`
  - `not_enough_information`
  - `not_applicable`
- **Exclusion criterion:** "A clinical trial turns away anyone this describes: "…". Going only by what `patient` says, does it describe this patient?". Options:
  - `applies`
  - `does_not_apply`
  - `not_enough_information`
  - `not_applicable`

  The question is phrased positively, so there is no double negative. Code inverts it: `applies` gives `likely fails`.
- **`not_applicable` is required.** Without it, cohort criteria ("For cutaneous melanoma: …", asked about a lung-cancer patient) came back `does_not_meet` at 0.72–0.73, which are false fails. With it they came back `not_applicable` at 0.87–0.88. No correct answer changed. `not_applicable` maps to "does not count against the trial", not to `likely meets`.

## What Jev got right and wrong

This is not an evaluation; GATE 1 is. It is what the spike showed.

- **Right, with high confidence:**
  - A stage III-only trial versus a stage IV patient: `does_not_meet`, 1.00.
  - "Known EGFR sensitive mutations" versus an EGFR exon 19 deletion: `applies`, 0.95.
  - "Previous systemic therapy" versus prior osimertinib: `applies`, 0.99.
  - "History of another malignancy" versus "never had any other cancer": `does_not_apply`, 0.96.
- **Missing information:** most criteria about labs, organ function, ECOG and consent came back `not_enough_information`, as intended. The sparse profile got 17 of 24 criteria as `not_enough_information`.
- **Low confidence where the profile only hints:** for example ECOG 0–1 against "can walk and do light housework" came back `meets`, 0.28–0.47. A threshold turns these into `ask your doctor`.
- **False fail that survives any threshold:** in a two-cohort trial, "Histologically confirmed diagnosis of NSCLC and cutaneous melanoma with distant metastases" came back `does_not_meet`, 0.98, for a NSCLC patient. Jev reads "and" literally (jaggedness: "Literal reading"). This is the worst failure mode and a **GATE 1 focus**.
- **Numbers and dates:** Jev is not reliable at math, counting or date windows (jaggedness: "Math and Numbers", "Date and time comparison"). Age is already a hard filter in code. Lab thresholds and "within N weeks" windows need a GATE 1 check. If they misfire, route criteria containing numeric thresholds or date windows to `ask your doctor` unless Jev answers `not_enough_information`.

## Starting thresholds (GATE 1 sets the real ones)

The asymmetry is on purpose, because a false `likely fails` is the worst outcome.

| Verdict | Needs |
|---|---|
| likely fails | `does_not_meet` / `applies` with confidence ≥ 0.90 |
| likely meets | `meets` / `does_not_apply` with confidence ≥ 0.80 |
| not counted | `not_applicable` with confidence ≥ 0.80 |
| ask your doctor | everything else, including all `not_enough_information` |

## Model version

- `jev-latest` is an alias. The deployed Worker pins `TYPESAFE_MODEL=jev-1.13.0` so cached verdicts and thresholds stay tied to the model they were checked on.
- KV cache keys use the `model` Jev reports in each response, not the requested alias. rx-jev learned this the hard way when an alias upgrade was silently served from stale cache.
- Moving to a new Jev version means re-running the GATE 1 sample first.
