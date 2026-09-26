import {
  PROBLEM_TYPES,
  type Profile,
  type SearchResponse,
  type TrialVerdictsResponse,
} from '@trialscout/contract'
import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.ts'
import { createDb } from '../src/db/index.ts'
import { PROBLEM_JSON } from '../src/problems.ts'
import { TrialStore } from '../src/store.ts'
import type { Trial } from '../src/trial.ts'
import { NOW, PUNE_NSCLC, seedPlaces, type TestOptions, testServices } from './helpers.ts'
import { FakeJev, when } from './jev.ts'
import { unreachable } from './recorded.ts'

beforeEach(async () => {
  await seedPlaces(createDb(env.DB))
})

const RECORDED = 'NCT06563999'

function request(
  path: string,
  body: unknown,
  options: TestOptions = {},
  ip = '203.0.113.9',
): Promise<Response> {
  return Promise.resolve(
    createApp(testServices(options)).request(
      path,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
        body: JSON.stringify(body),
      },
      env,
    ),
  )
}

function open(nctId: string, profile: Profile, options: TestOptions = {}): Promise<Response> {
  return request(`/api/trials/${nctId}/verdicts`, profile, options)
}

async function body(response: Response): Promise<TrialVerdictsResponse> {
  expect(response.status).toBe(200)
  return (await response.json()) as TrialVerdictsResponse
}

describe('POST /api/trials/:nctId/verdicts', () => {
  it('returns every criterion with its verdict, confidence and verbatim text', async () => {
    const jev = new FakeJev(when('"Pregnant', 'does_not_apply', 0.97))
    const trial = await body(await open(RECORDED, PUNE_NSCLC, { jev }))

    expect(trial.nctId).toBe(RECORDED)
    expect(trial.url).toBe(`https://clinicaltrials.gov/study/${RECORDED}`)
    expect(trial.eligibility).toBe('split')
    expect(trial.rawCriteria).toBeNull()
    expect(trial.criteria.length).toBeGreaterThan(3)
    expect(trial.criteria.some((c) => c.kind === 'inclusion')).toBe(true)
    expect(trial.criteria.some((c) => c.kind === 'exclusion')).toBe(true)
    for (const c of trial.criteria) {
      expect(c.verdict).not.toBe('not_checked')
      expect(c.confidence).not.toBeNull()
      expect(c.text.trim()).not.toBe('')
    }
    const judged = trial.criteria.filter((c) => c.verdict !== 'not_applicable')
    expect(
      trial.counts.likely_meets + trial.counts.ask_your_doctor + trial.counts.likely_fails,
    ).toBe(judged.length)
    expect(trial.checked.model).toBe('jev-1.13.0')
    expect(trial.dataAsOf).toBe(NOW)
  })

  it('judges on demand what the search left not checked, reusing its answers', async () => {
    const searched = (await (
      await request('/api/search', PUNE_NSCLC, {
        jev: new FakeJev(when('turns away', 'applies', 0.99)),
      })
    ).json()) as SearchResponse
    const failed = searched.results.find((r) => r.counts.not_checked > 0)
    if (failed === undefined) throw new Error('Expected a trial with criteria not checked')

    const jev = new FakeJev()
    const trial = await body(await open(failed.nctId, PUNE_NSCLC, { jev, fetch: unreachable() }))

    expect(trial.counts.not_checked).toBe(0)
    expect(trial.counts.likely_fails).toBe(failed.counts.likely_fails)
    expect(jev.questionsAsked).toBe(failed.counts.not_checked)
    expect(trial.checked.cacheHits).toBe(1)
  })

  it('shows an unsplittable trial as its raw text, without asking Jev', async () => {
    const raw: Trial = {
      nctId: 'NCT00000042',
      title: 'A trial with free-form rules',
      phases: [],
      sponsor: null,
      conditions: ['Lung cancer'],
      status: 'RECRUITING',
      lastUpdated: '2026-09-01',
      eligibility: {
        criteria: 'Adults with lung cancer who are well enough to take part.',
        sex: 'ALL',
        minimumAgeYears: 18,
        maximumAgeYears: null,
      },
      sites: [],
    }
    await new TrialStore(createDb(env.DB), () => NOW).save([raw])
    const jev = new FakeJev()
    const trial = await body(await open(raw.nctId, PUNE_NSCLC, { jev, fetch: unreachable() }))

    expect(trial.eligibility).toBe('unsplittable')
    expect(trial.criteria).toEqual([])
    expect(trial.rawCriteria).toBe(raw.eligibility.criteria)
    expect(trial.counts.ask_your_doctor).toBe(1)
    expect(jev.requests).toHaveLength(0)
  })

  it('answers a trial ClinicalTrials.gov does not know with a 404', async () => {
    const response = await open('NCT09999999', PUNE_NSCLC)

    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toBe(PROBLEM_JSON)
    expect(await response.json()).toMatchObject({ type: PROBLEM_TYPES.trialNotFound })
  })

  it('rejects a malformed NCT number and an invalid profile with a 422', async () => {
    const badId = await open('NCT123', PUNE_NSCLC)
    expect(badId.status).toBe(422)
    expect(await badId.json()).toMatchObject({ detail: 'Invalid request: path.nctId' })

    const badProfile = await request(`/api/trials/${RECORDED}/verdicts`, { ...PUNE_NSCLC, age: -1 })
    expect(badProfile.status).toBe(422)
    expect(await badProfile.json()).toMatchObject({ detail: 'Invalid request: body.age' })
  })

  it('limits trial checks per client, apart from searches', async () => {
    const options: TestOptions = {
      limits: [{ count: 1, seconds: 60 }],
      trialLimits: [{ count: 1, seconds: 60 }],
    }
    expect((await request('/api/search', PUNE_NSCLC, options)).status).toBe(200)
    expect((await open(RECORDED, PUNE_NSCLC, options)).status).toBe(200)

    const limited = await open(RECORDED, { ...PUNE_NSCLC, age: 59 }, options)
    expect(limited.status).toBe(429)
    expect(limited.headers.get('retry-after')).toMatch(/^\d+$/)
    expect(await limited.json()).toMatchObject({ type: PROBLEM_TYPES.rateLimited })
  })

  it('does not count a check answered wholly from the cache', async () => {
    const options: TestOptions = { trialLimits: [{ count: 1, seconds: 60 }] }
    expect((await open(RECORDED, PUNE_NSCLC, options)).status).toBe(200)
    // Same profile and trial: every answer is cached, so Jev is not asked and nothing counts.
    expect((await open(RECORDED, PUNE_NSCLC, options)).status).toBe(200)
    expect((await open(RECORDED, PUNE_NSCLC, options)).status).toBe(200)
  })
})
