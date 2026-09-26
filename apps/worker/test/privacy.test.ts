import type { Profile, SearchResponse } from '@trialscout/contract'
import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest'
import { createApp } from '../src/app.ts'
import { createDb } from '../src/db/index.ts'
import { criteria, trials } from '../src/db/schema.ts'
import type { JevRequest } from '../src/judge/jev.ts'
import { PUNE_NSCLC, seedPlaces, type TestOptions, testServices } from './helpers.ts'
import { FakeJev } from './jev.ts'
import { mockFetch } from './recorded.ts'

// The privacy audit (docs/privacy.md), as tests: a profile never reaches a log, D1 or KV,
// on the happy path or any failure.

// Words that appear nowhere in the recorded trials, so finding them anywhere means the
// profile leaked.
const MARKER = 'zebra-7f3a'
const PROFILE: Profile = { ...PUNE_NSCLC, notes: `Marker ${MARKER}: had surgery on my left lung.` }
const LEAKS = new RegExp(`${MARKER}|had surgery on my left`, 'i')

// Jev rejecting a request the way the TypeSafe SDK reports it: an APIError whose message
// quotes the API's error detail, which can echo the submitted state.
class EchoingJev extends FakeJev {
  override async ask(request: JevRequest): Promise<unknown> {
    const error = new Error(`422 Invalid state: ${JSON.stringify(request.state)}`)
    error.name = 'UnprocessableEntityError'
    throw Object.assign(error, { status: 422 })
  }
}

function request(path: string, body: unknown, options: TestOptions = {}): Promise<Response> {
  return Promise.resolve(
    createApp(testServices(options)).request(
      path,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.9' },
        body: JSON.stringify(body),
      },
      env,
    ),
  )
}

let logs: MockInstance[] = []

function logged(): string {
  return JSON.stringify(logs.flatMap((spy) => spy.mock.calls))
}

beforeEach(async () => {
  await seedPlaces(createDb(env.DB))
  logs = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
    vi.spyOn(console, level).mockImplementation(() => {}),
  )
})

describe('privacy', () => {
  it('logs nothing from the profile when a search and a trial check succeed', async () => {
    const search = await request('/api/search', PROFILE)
    const body = (await search.json()) as SearchResponse
    const first = body.results[0]?.nctId ?? ''
    expect((await request(`/api/trials/${first}/verdicts`, PROFILE)).status).toBe(200)

    expect(logged()).not.toMatch(LEAKS)
  })

  it('logs only the kind and status of a Jev failure, never its message', async () => {
    const response = await request('/api/search', PROFILE, { jev: new EchoingJev() })

    expect(response.status).toBe(503)
    expect(logged()).toContain('UnprocessableEntityError (HTTP 422)')
    expect(logged()).not.toMatch(LEAKS)
    expect(logged()).not.toMatch(/Pune|non-small/i)
  })

  it('logs nothing from the profile when ClinicalTrials.gov is down or the body is invalid', async () => {
    const down = { fetch: mockFetch(() => new Response('down', { status: 503 })) }
    expect((await request('/api/search', PROFILE, down)).status).toBe(502)
    expect((await request('/api/search', { ...PROFILE, age: 'forty' })).status).toBe(422)
    expect((await request('/api/trials/NCT00000000/verdicts', PROFILE, down)).status).toBe(502)

    expect(logged()).not.toMatch(LEAKS)
  })

  it('stores nothing from the profile in D1 or KV', async () => {
    const search = await request('/api/search', PROFILE)
    const body = (await search.json()) as SearchResponse
    await request(`/api/trials/${body.results[0]?.nctId ?? ''}/verdicts`, PROFILE)

    const db = createDb(env.DB)
    const stored = JSON.stringify([
      await db.select().from(trials),
      await db.select().from(criteria),
    ])
    expect(stored.length).toBeGreaterThan(1000)
    expect(stored).not.toMatch(LEAKS)

    const { keys } = await env.CACHE.list()
    expect(keys.length).toBeGreaterThan(0)
    for (const { name } of keys) {
      expect(name).toMatch(/^jev:[0-9a-f]{64}$/)
      expect((await env.CACHE.get(name)) ?? '').not.toMatch(/zebra|surgery|Pune|India/i)
    }
  })
})
