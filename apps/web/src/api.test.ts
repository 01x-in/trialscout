import {
  PROBLEM_TYPES,
  type Profile,
  type SearchResponse,
  type TrialVerdictsResponse,
} from '@trialscout/contract'
import { describe, expect, it } from 'vitest'
import { checkTrial, searchTrials } from './api.ts'

const PROFILE: Profile = {
  cancerType: 'breast cancer',
  stage: 'II',
  age: 47,
  sex: 'female',
  country: 'India',
  city: 'Mumbai',
  maxDistanceKm: 100,
}

const RESPONSE: SearchResponse = {
  location: { city: 'Mumbai', countryCode: 'IN' },
  results: [],
  empty: { reason: 'none_nearby', relax: 'distance' },
  checked: { questions: 0, requests: 0, cacheHits: 0, model: null },
  source: 'live',
  dataAsOf: 1_790_000_000_000,
  listed: { total: 0, read: 0 },
}

function problem(status: number, type: string, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ type, title: 'x', status, detail: 'Something.' }), {
    status,
    headers: { 'Content-Type': 'application/problem+json', ...headers },
  })
}

function fetching(reply: () => Response | Promise<Response>, seen: Request[] = []): typeof fetch {
  return async (input, init) => {
    seen.push(new Request(input, init))
    return reply()
  }
}

describe('searchTrials', () => {
  it('posts the profile to /api/search and returns the results', async () => {
    const seen: Request[] = []
    const outcome = await searchTrials(
      PROFILE,
      fetching(() => Response.json(RESPONSE), seen),
    )

    expect(outcome).toEqual({ kind: 'results', response: RESPONSE })
    expect(seen[0]?.method).toBe('POST')
    expect(new URL(seen[0]?.url ?? '').pathname).toBe('/api/search')
    expect(await seen[0]?.json()).toEqual(PROFILE)
  })

  it.each([
    [PROBLEM_TYPES.unknownCity, 'city'],
    [PROBLEM_TYPES.unknownCountry, 'country'],
  ] as const)('reports an unknown place (%s) against its field', async (type, field) => {
    const outcome = await searchTrials(
      PROFILE,
      fetching(() => problem(422, type)),
    )

    expect(outcome).toEqual({ kind: 'unknown_place', field, message: 'Something.' })
  })

  it('reports a rate limit with how long to wait', async () => {
    const outcome = await searchTrials(
      PROFILE,
      fetching(() => problem(429, PROBLEM_TYPES.rateLimited, { 'Retry-After': '42' })),
    )

    expect(outcome).toEqual({ kind: 'rate_limited', retryAfterSeconds: 42 })
  })

  it.each([500, 502, 503])('reports HTTP %d as unavailable', async (status) => {
    const outcome = await searchTrials(
      PROFILE,
      fetching(() => problem(status, 'about:blank')),
    )

    expect(outcome).toEqual({ kind: 'unavailable' })
  })

  it('reports a successful response with an unreadable body as unavailable', async () => {
    const outcome = await searchTrials(
      PROFILE,
      fetching(() => new Response('{"results": [', { status: 200 })),
    )

    expect(outcome).toEqual({ kind: 'unavailable' })
  })

  it('reports a network failure as unavailable', async () => {
    const outcome = await searchTrials(
      PROFILE,
      fetching(() => {
        throw new TypeError('Failed to fetch')
      }),
    )

    expect(outcome).toEqual({ kind: 'unavailable' })
  })
})

const TRIAL: TrialVerdictsResponse = {
  nctId: 'NCT00000001',
  title: 'A study',
  phases: ['PHASE2'],
  sponsor: null,
  url: 'https://clinicaltrials.gov/study/NCT00000001',
  eligibility: 'split',
  criteria: [],
  rawCriteria: null,
  counts: { likely_meets: 0, likely_fails: 0, ask_your_doctor: 0, not_checked: 0 },
  checked: { questions: 0, requests: 0, cacheHits: 0, model: null },
  dataAsOf: 1_790_000_000_000,
}

describe('checkTrial', () => {
  it('posts the profile in the body, never the URL, and returns the verdicts', async () => {
    const seen: Request[] = []
    const outcome = await checkTrial(
      'NCT00000001',
      PROFILE,
      fetching(() => Response.json(TRIAL), seen),
    )

    expect(outcome).toEqual({ kind: 'verdicts', response: TRIAL })
    expect(seen[0]?.method).toBe('POST')
    const url = new URL(seen[0]?.url ?? '')
    expect(url.pathname).toBe('/api/trials/NCT00000001/verdicts')
    expect(url.search).toBe('')
    expect(await seen[0]?.json()).toEqual(PROFILE)
  })

  it('reports a trial ClinicalTrials.gov does not know', async () => {
    const outcome = await checkTrial(
      'NCT00000001',
      PROFILE,
      fetching(() => problem(404, PROBLEM_TYPES.trialNotFound)),
    )

    expect(outcome).toEqual({ kind: 'not_found' })
  })

  it('reports a rate limit with how long to wait', async () => {
    const outcome = await checkTrial(
      'NCT00000001',
      PROFILE,
      fetching(() => problem(429, PROBLEM_TYPES.rateLimited, { 'Retry-After': '30' })),
    )

    expect(outcome).toEqual({ kind: 'rate_limited', retryAfterSeconds: 30 })
  })

  it('reports a successful response with an unreadable body as unavailable', async () => {
    const outcome = await checkTrial(
      'NCT00000001',
      PROFILE,
      fetching(() => new Response('{"criteria": [', { status: 200 })),
    )

    expect(outcome).toEqual({ kind: 'unavailable' })
  })

  it('reports a failure or network error as unavailable', async () => {
    expect(
      await checkTrial(
        'NCT00000001',
        PROFILE,
        fetching(() => problem(503, 'about:blank')),
      ),
    ).toEqual({ kind: 'unavailable' })
    expect(
      await checkTrial(
        'NCT00000001',
        PROFILE,
        fetching(() => {
          throw new TypeError('Failed to fetch')
        }),
      ),
    ).toEqual({ kind: 'unavailable' })
  })
})
