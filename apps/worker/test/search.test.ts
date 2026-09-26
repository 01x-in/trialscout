import { PROBLEM_TYPES, type Profile, type SearchResponse } from '@trialscout/contract'
import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/app.ts'
import { createDb } from '../src/db/index.ts'
import { eq } from 'drizzle-orm'
import { criteria, trials } from '../src/db/schema.ts'
import { PROBLEM_JSON } from '../src/problems.ts'
import { rankTrials } from '../src/ranking.ts'
import { NOW, PUNE_NSCLC, seedPlaces, type TestOptions, testServices } from './helpers.ts'
import { FakeJev, rules } from './jev.ts'
import { mockFetch } from './recorded.ts'

beforeEach(async () => {
  await seedPlaces(createDb(env.DB))
})

function post(body: unknown, options: TestOptions = {}, bindings: object = env): Promise<Response> {
  return Promise.resolve(
    createApp(testServices(options)).request(
      '/api/search',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.9' },
        body: JSON.stringify(body),
      },
      bindings,
    ),
  )
}

async function detail(response: Response): Promise<string> {
  return ((await response.json()) as { detail: string }).detail
}

describe('POST /api/search', () => {
  it('returns recruiting trials near the patient, ranked, with verdict counts', async () => {
    const response = await post(PUNE_NSCLC)
    expect(response.status).toBe(200)
    const body = (await response.json()) as SearchResponse

    expect(body.location).toEqual({ city: 'Pune', countryCode: 'IN' })
    expect(body.empty).toBeNull()
    expect(body.results.length).toBeGreaterThan(0)
    expect(body.results.length).toBeLessThanOrEqual(10)
    for (const result of body.results) {
      expect(result.url).toBe(`https://clinicaltrials.gov/study/${result.nctId}`)
      if (result.nearestSite !== null)
        expect(result.nearestSite.distanceKm).toBeLessThanOrEqual(300)
    }
    const order = rankTrials(
      body.results.map((r) => ({ ...r, distanceKm: r.nearestSite?.distanceKm ?? null })),
    ).map((r) => r.nctId)
    expect(body.results.map((r) => r.nctId)).toEqual(order)
    expect(body.checked.questions).toBeGreaterThan(0)
    expect(body.checked.model).toBe('jev-1.13.0')
  })

  it('ranks a trial with a confident fail last, and keeps it', async () => {
    const baseline = (await (await post(PUNE_NSCLC)).json()) as SearchResponse
    const first = baseline.results[0]
    if (first === undefined) throw new Error('Expected results')

    const failFirst = new FakeJev(
      rules((instructions, _options, state) => {
        const trial = state.trial as { title?: string } | undefined
        return trial?.title === first.title && instructions.includes('turns away')
          ? { choice: 'applies', confidence: 0.99 }
          : undefined
      }),
    )
    const body = (await (
      await post({ ...PUNE_NSCLC, age: 57 }, { jev: failFirst })
    ).json()) as SearchResponse

    expect(body.results.at(-1)?.nctId).toBe(first.nctId)
    expect(body.results.at(-1)?.counts.likely_fails).toBeGreaterThan(0)
    expect(body.results).toHaveLength(baseline.results.length)
  })

  it("never sends the patient's city, country or travel distance to Jev", async () => {
    const jev = new FakeJev()
    await post(PUNE_NSCLC, { jev })

    expect(jev.requests.length).toBeGreaterThan(0)
    for (const request of jev.requests) {
      expect(JSON.stringify(request.state)).not.toMatch(/Pune|India|300/)
    }
  })

  it("stores each trial's split criteria in D1", async () => {
    await post(PUNE_NSCLC)

    expect((await createDb(env.DB).select().from(criteria)).length).toBeGreaterThan(0)
  })

  it('explains an empty result and suggests a larger distance', async () => {
    const body = (await (
      await post({
        ...PUNE_NSCLC,
        cancerType: 'glioblastoma',
        city: 'Ushuaia',
        country: 'Argentina',
        maxDistanceKm: 50,
      })
    ).json()) as SearchResponse

    expect(body.results).toEqual([])
    expect(body.empty).toEqual({ reason: 'none_nearby', relax: 'distance' })
  })

  it.each([
    [{ city: 'Atlantis City' }, PROBLEM_TYPES.unknownCity],
    [{ country: 'Atlantis' }, PROBLEM_TYPES.unknownCountry],
  ])(
    'answers an unknown place %j with a 422 that does not count against the limit',
    async (place, type) => {
      const limits = [{ count: 1, seconds: 60 }]
      const response = await post({ ...PUNE_NSCLC, ...place }, { limits })

      expect(response.status).toBe(422)
      expect(((await response.json()) as { type: string }).type).toBe(type)
      expect((await post(PUNE_NSCLC, { limits })).status).toBe(200)
    },
  )

  it('limits searches per client with a calm 429 and Retry-After', async () => {
    const limits = [{ count: 1, seconds: 60 }]
    expect((await post(PUNE_NSCLC, { limits })).status).toBe(200)
    const response = await post(PUNE_NSCLC, { limits })

    expect(response.status).toBe(429)
    expect(response.headers.get('content-type')).toBe(PROBLEM_JSON)
    expect(Number(response.headers.get('retry-after'))).toBeGreaterThan(0)
    expect(((await response.json()) as { type: string }).type).toBe(PROBLEM_TYPES.rateLimited)
  })

  it('answers a Jev failure with a calm 503', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const response = await post(PUNE_NSCLC, { jev: null })

    expect(response.status).toBe(503)
    expect(await detail(response)).toBe('Trial checks are unavailable right now. Try again later.')
  })

  it('answers a ClinicalTrials.gov failure with a calm 502', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const response = await post(PUNE_NSCLC, {
      fetch: mockFetch(() => new Response('down', { status: 503 })),
    })

    expect(response.status).toBe(502)
    expect(await detail(response)).toBe('Trial data is unavailable right now. Try again later.')
  })

  it('says a live search came from ClinicalTrials.gov just now', async () => {
    const body = (await (await post(PUNE_NSCLC)).json()) as SearchResponse

    expect(body.source).toBe('live')
    expect(body.dataAsOf).toBe(NOW)
  })
})

describe('POST /api/search while ClinicalTrials.gov is down', () => {
  const DOWN: TestOptions = { fetch: mockFetch(() => new Response('down', { status: 503 })) }
  const FIVE_DAYS_AGO = NOW - 5 * 86_400_000

  async function liveSearchFirst(): Promise<SearchResponse> {
    const live = (await (await post(PUNE_NSCLC)).json()) as SearchResponse
    // One saved trial was last confirmed five days ago.
    const oldest = live.results.at(-1)?.nctId ?? ''
    await createDb(env.DB)
      .update(trials)
      .set({ checked_at: FIVE_DAYS_AGO })
      .where(eq(trials.nct_id, oldest))
    return live
  }

  it('serves saved trials nearby, dated by the oldest check among them', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const live = await liveSearchFirst()

    const response = await post(PUNE_NSCLC, DOWN)
    expect(response.status).toBe(200)
    const body = (await response.json()) as SearchResponse

    expect(body.source).toBe('saved')
    expect(body.dataAsOf).toBe(FIVE_DAYS_AGO)
    expect(body.location).toEqual({ city: 'Pune', countryCode: 'IN' })
    expect(body.results.length).toBeGreaterThan(0)
    const liveIds = new Set(live.results.map((r) => r.nctId))
    for (const result of body.results) {
      expect(liveIds.has(result.nctId)).toBe(true)
      expect(result.url).toBe(`https://clinicaltrials.gov/study/${result.nctId}`)
    }
    // Jev answers are cached per trial, so the saved copy is judged the same way.
    expect(body.checked.cacheHits).toBeGreaterThan(0)
  })

  it('does not mark the saved trials as checked while serving them', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await liveSearchFirst()
    const before = await createDb(env.DB)
      .select({ id: trials.nct_id, checked: trials.checked_at })
      .from(trials)

    await post(PUNE_NSCLC, DOWN)

    expect(
      await createDb(env.DB).select({ id: trials.nct_id, checked: trials.checked_at }).from(trials),
    ).toEqual(before)
  })

  it('logs the outage without the patient’s condition or place', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await liveSearchFirst()

    await post(PUNE_NSCLC, DOWN)

    expect(warn).toHaveBeenCalled()
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/lung|Pune|India|18\.52|73\.85/i)
  })

  it('answers a calm 502 when no saved trial fits', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await liveSearchFirst()

    const response = await post({ ...PUNE_NSCLC, cancerType: 'glioblastoma' }, DOWN)

    expect(response.status).toBe(502)
  })
})

describe('POST /api/search validation (Typia)', () => {
  const profile: Profile = { ...PUNE_NSCLC }

  it.each([
    ['a wrong type', { ...profile, age: 'fifty-eight' }, 'Invalid request: body.age'],
    ['a broken type tag', { ...profile, maxDistanceKm: 0 }, 'Invalid request: body.maxDistanceKm'],
    ['an unknown stage', { ...profile, stage: 'V' }, 'Invalid request: body.stage'],
    [
      'two bad fields',
      { ...profile, sex: 'other', city: '' },
      'Invalid request: body.sex, body.city',
    ],
  ])('answers %s with a 422 naming the field', async (_label, body, expected) => {
    const response = await post(body)

    expect(response.status).toBe(422)
    expect(response.headers.get('content-type')).toBe(PROBLEM_JSON)
    expect(await detail(response)).toBe(expected)
  })

  it('answers a missing field with a 422 naming it', async () => {
    const { city: _city, ...withoutCity } = profile
    const response = await post(withoutCity)

    expect(response.status).toBe(422)
    expect(await detail(response)).toBe('Invalid request: body.city')
  })

  it('never echoes profile contents in an error', async () => {
    const text = await (await post({ ...profile, age: 'fifty-eight' })).text()

    expect(text).not.toContain('fifty-eight')
    expect(text).not.toContain('osimertinib')
    expect(text).not.toContain('Pune')
  })

  it('refuses to run on invalid Worker config', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = await post(profile, {}, { ...env, TYPESAFE_MODEL: ' ' })

    expect(response.status).toBe(500)
    expect(await detail(response)).toBe('An unexpected error occurred.')
  })
})
