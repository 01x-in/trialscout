# Privacy audit (M3.5)

Audited on 2026-09-27 against the product rule: *no patient data stored server-side; profiles are used for scoring and discarded; no request-body logging; no analytics that capture profile contents; the profile lives only in browser `sessionStorage`; KV values hold verdicts only.*

The tests named below hold the result in place. Re-run this audit whenever a log line, a storage write, a binding or a third-party call is added.

## Where the profile goes

| Place | What it gets | Kept? |
| --- | --- | --- |
| Browser `sessionStorage` (`trialscout.profile`) | The whole profile | Until the tab closes. No cookies. `localStorage` holds only the viewer's theme pick (`trialscout.theme`: `light` or `dark`), never anything from the profile. |
| `POST /api/search`, `POST /api/trials/:nctId/verdicts` | The whole profile, in the JSON body, never the URL | No. Used for the request, then dropped. |
| ClinicalTrials.gov | The condition as typed, the city's coordinates (from GeoNames, in our own D1) and the distance | Their server logs, under their terms. No age, sex, stage or notes. |
| Jev (TypeSafe AI) | Cancer type, stage, age, sex and notes, with the trial's title and conditions | Their service, under their terms. No city, country or distance. |
| D1 | Nothing from the profile. Trials, criteria and GeoNames places only. | |
| KV `CACHE` | Nothing from the profile. The key is a SHA-256 hash, and the value holds answers and a model name. | 7 days |
| Durable Object `SEARCH_LIMITER` | The client's IP address (the object's name and its hit keys), with hit times | Deleted by an alarm once the longest window (1 day) has passed with no new hit |
| Worker logs | Fixed text, counts, method and path, and error kinds (see below) | Workers Logs retention |

## Checks

- **No request-body logging.**
  - The Worker has six `console` calls, and each logs fixed text, counts, or `METHOD /path` plus an error chain.
  - The errors are ours, with fixed messages, or platform errors such as fetch failures and timeouts.
  - *Fixed in this audit:* a Jev failure logged the TypeSafe SDK's message. For an API error that message quotes the API's error detail, which can echo the request state, and so the profile. Jev failures now log only the error's class and HTTP status (`redacted()` in `judge.ts`).
  - The outage fallback logs fixed text, because the ClinicalTrials.gov error could carry the query.
- **Invocation logs off.**
  - *Changed in this audit:* both Workers keep `observability` on for console logs only.
  - `invocation_logs` is now `false`. Those logs record each request's metadata, including where Cloudflare places the client's IP, and the app does not need that.
- **No profile in errors.** Problem Details never echo the body. A 422 names the invalid fields, not their values.
- **Rate-limit state expires.**
  - *Fixed in this audit:* a client that never came back left its IP and hit times in its Durable Object forever.
  - The object now sets an alarm for when its last hit leaves the longest window, and then deletes all its storage.
- **No analytics or third-party assets.**
  - `index.html` and `index.css` load nothing from another origin: no scripts, fonts or images. `index.css` imports only Tailwind and `tw-animate-css`, which Vite bundles into our own stylesheet.
  - The landing page's demo video, its poster and its captions are our own files (`apps/web/public/demo`), served from trialscout.cc by the web Worker. There is no third-party video player or embed, so watching it tells nobody else.
  - The Geist font comes from the `@fontsource-variable/geist` package. Vite copies its files into our own `/assets`, so the browser fetches it from trialscout.cc and never from a font service.
  - The web Worker only forwards `/api/*` to the API Worker and serves static files. It logs nothing.
- **Cache and store.** The KV key is a hash of the model, question version, trial, criteria and normalised profile without location. The value holds answers only. D1 rows come from ClinicalTrials.gov and GeoNames only.

## Tests

- `apps/worker/test/privacy.test.ts`:
  - no profile marker reaches any `console` call on a search and a trial check;
  - a Jev failure whose message echoes the state is logged as kind and status only;
  - nothing reaches the logs from a ClinicalTrials.gov outage or a 422;
  - D1 and KV hold no profile marker.
- `apps/worker/test/search-limiter.test.ts`: the limiter schedules its own deletion and deletes everything once every hit has expired.
- `apps/worker/test/judge.test.ts`: KV keys are hashes and values hold no profile content.
- `apps/worker/test/search.test.ts`:
  - errors never echo the profile;
  - Jev never sees the city, country or distance;
  - the outage log names no condition or place.
- `apps/web/src/privacy.test.tsx`:
  - no third-party assets, the font files are served from our own site, and so are the landing page's video, poster and captions;
  - the profile stays in `sessionStorage` only, and `localStorage` holds nothing but the theme pick;
  - the profile is sent only to our own `/api`, in the body.

## Not covered here

- What ClinicalTrials.gov and TypeSafe AI keep is set by their own terms.
- Cloudflare sees the client IP for every request, as with any site it serves.
- What we tell people, and where:
  - The search page says, right above "Find trials": "We don't store your answers. They stay in this browser tab. Each check sends them to our server, which uses them and then throws them away. No accounts, no tracking." It links to the About page's section.
  - The About page's "Your answers stay with you" names the two things kept for a short time, neither holding answers: Jev's verdicts in KV for up to 7 days under a hashed key, and the client's IP address with search times in the rate limiter for up to a day. It also says ClinicalTrials.gov and TypeSafe AI keep what they get under their own terms.
  - Keep both in step with the table above whenever it changes.
