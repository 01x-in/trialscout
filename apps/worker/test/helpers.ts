import type { Profile } from '@trialscout/contract'
import { CtGovClient } from '../src/clients/ctgov.ts'
import { CTGOV_BASE_URL } from '../src/clients/ctgov-query.ts'
import { readConfig } from '../src/config.ts'
import { createDb, type Db } from '../src/db/index.ts'
import { cities, cityNames, countries } from '../src/db/schema.ts'
import type { Env } from '../src/env.ts'
import type { Fetch } from '../src/http.ts'
import { kvAnswerCache } from '../src/judge/cache.ts'
import { Judge } from '../src/judge/judge.ts'
import { durableSearchLimiter } from '../src/limiter.ts'
import type { Limit } from '../src/ratelimit.ts'
import type { ServicesFactory } from '../src/services.ts'
import { TrialStore } from '../src/store.ts'
import { FakeJev } from './jev.ts'
import { ctgovFetch } from './recorded.ts'

export const FAST = { attempts: 1, timeoutMs: 1_000, backoffMs: 0 }
export const NOW = 1_790_000_000_000

// The profile the recorded ClinicalTrials.gov searches were made for (scripts/record-ctgov.ts).
export const PUNE_NSCLC: Profile = {
  cancerType: 'non-small cell lung cancer',
  stage: 'IV',
  age: 58,
  sex: 'female',
  country: 'India',
  city: 'Pune',
  maxDistanceKm: 300,
  notes: 'EGFR exon 19 deletion. Took osimertinib.',
}

/** The places the recorded searches were made from, as the GeoNames import stores them. */
export async function seedPlaces(db: Db): Promise<void> {
  await db.insert(countries).values([
    { code: 'IN', iso3: 'IND', name: 'India', name_key: 'india' },
    { code: 'AR', iso3: 'ARG', name: 'Argentina', name_key: 'argentina' },
  ])
  await db.insert(cities).values([
    {
      geonameid: 1259229,
      name: 'Pune',
      country_code: 'IN',
      lat: 18.5204,
      lon: 73.8567,
      population: 3124458,
    },
    {
      geonameid: 3833367,
      name: 'Ushuaia',
      country_code: 'AR',
      lat: -54.8019,
      lon: -68.303,
      population: 57000,
    },
  ])
  await db.insert(cityNames).values([
    { key: 'pune', geonameid: 1259229 },
    { key: 'ushuaia', geonameid: 3833367 },
  ])
}

export type TestOptions = {
  jev?: FakeJev | null
  fetch?: Fetch
  limits?: Limit[]
  trialLimits?: Limit[]
  budget?: { maxQuestions: number; maxRequests: number }
}

/** Services from the test bindings: recorded ClinicalTrials.gov, a fake Jev, small pages. */
export function testServices(options: TestOptions = {}): ServicesFactory {
  const jev = options.jev === undefined ? new FakeJev() : options.jev
  return (env: Env) => {
    const config = readConfig(env)
    const db = createDb(env.DB)
    return {
      config,
      db,
      ctgov: new CtGovClient({
        baseUrl: CTGOV_BASE_URL,
        fetch: options.fetch ?? ctgovFetch(),
        retry: FAST,
      }),
      judge: new Judge(jev, 'jev-1.13.0', kvAnswerCache(env.CACHE)),
      store: new TrialStore(db, () => NOW),
      limiter: durableSearchLimiter(
        env.SEARCH_LIMITER,
        options.limits ?? [{ count: 100, seconds: 60 }],
      ),
      trialLimiter: durableSearchLimiter(
        env.SEARCH_LIMITER,
        options.trialLimits ?? [{ count: 100, seconds: 60 }],
      ),
      settings: {
        pageSize: 5,
        maxPages: 2,
        budget: options.budget ?? { maxQuestions: 300, maxRequests: 30 },
        trialBudget: { maxQuestions: 200, maxRequests: 6 },
      },
      now: () => NOW,
    }
  }
}
