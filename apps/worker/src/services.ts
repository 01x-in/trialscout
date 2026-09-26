import { TypeSafeClient } from '@typesafe-ai/sdk'
import { CtGovClient } from './clients/ctgov.ts'
import { type Config, readConfig } from './config.ts'
import { createDb, type Db } from './db/index.ts'
import type { Env } from './env.ts'
import type { Fetch } from './http.ts'
import { kvAnswerCache } from './judge/cache.ts'
import { sdkJev } from './judge/jev.ts'
import { type Budget, Judge } from './judge/judge.ts'
import { durableSearchLimiter } from './limiter.ts'
import type { ClientLimiter } from './ratelimit.ts'
import { TrialStore } from './store.ts'

// What the routes use, built per request from the Worker's bindings. Tests build it from
// recorded upstreams, a fake Jev and small page sizes instead.

export type SearchSettings = {
  // ClinicalTrials.gov trials per page, and pages read per search.
  pageSize: number
  maxPages: number
  budget: Budget
  // Jev work for one opened trial: every criterion of all but a mis-split trial.
  trialBudget: Budget
  // The daily refresh: trials per ClinicalTrials.gov request, and requests per run.
  refresh: { batchSize: number; maxBatches: number }
}

// Up to 100 trials per search before hard filters; Jev work capped as in docs/jev-budget.md.
// The refresh re-reads up to 500 saved trials a day, least recently checked first.
export const SEARCH_SETTINGS: SearchSettings = {
  pageSize: 50,
  maxPages: 2,
  budget: { maxQuestions: 300, maxRequests: 30 },
  trialBudget: { maxQuestions: 200, maxRequests: 6 },
  refresh: { batchSize: 100, maxBatches: 5 },
}

export type Services = {
  config: Config
  db: Db
  ctgov: CtGovClient
  judge: Judge
  store: TrialStore
  limiter: ClientLimiter
  // Opened trials, counted apart from searches.
  trialLimiter: ClientLimiter
  settings: SearchSettings
  now: () => number
}

export type ServicesFactory = (env: Env) => Services

const globalFetch: Fetch = (input, init) => fetch(input, init)

// One Jev request carries one trial's criteria of one kind.
const JEV_TIMEOUT_MS = 30_000

function jevClient(config: Config): TypeSafeClient | null {
  if (config.typesafeApiKey === null) return null
  return new TypeSafeClient({
    apiKey: config.typesafeApiKey,
    timeout: JEV_TIMEOUT_MS,
    // The SDK retries 408, 429 and 5xx with backoff; two retries bound the total wait.
    retry: { maxRetries: 2 },
    logLevel: 'warn',
  })
}

/** The production services, from the Worker's bindings. Throws on invalid config. */
export function workerServices(env: Env): Services {
  const config = readConfig(env)
  const db = createDb(env.DB)
  const jev = jevClient(config)
  return {
    config,
    db,
    ctgov: new CtGovClient({ baseUrl: config.ctgovBaseUrl, fetch: globalFetch }),
    judge: new Judge(
      jev === null ? null : sdkJev(jev),
      config.typesafeModel,
      kvAnswerCache(env.CACHE),
    ),
    store: new TrialStore(db),
    limiter: durableSearchLimiter(env.SEARCH_LIMITER, [
      { count: config.searchPerMinute, seconds: 60 },
      { count: config.searchPerDay, seconds: 86_400 },
    ]),
    trialLimiter: durableSearchLimiter(env.SEARCH_LIMITER, [
      { count: config.trialChecksPerMinute, seconds: 60 },
      { count: config.trialChecksPerDay, seconds: 86_400 },
    ]),
    settings: SEARCH_SETTINGS,
    now: Date.now,
  }
}
