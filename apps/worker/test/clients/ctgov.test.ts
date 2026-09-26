import { describe, expect, it, vi } from 'vitest'
import { CtGovClient } from '../../src/clients/ctgov.ts'
import { CTGOV_BASE_URL, type TrialQuery } from '../../src/clients/ctgov-query.ts'
import { UpstreamError } from '../../src/problems.ts'
import { ctgovFetch, json, mockFetch, recording } from '../recorded.ts'

const FAST = { attempts: 1, timeoutMs: 1_000, backoffMs: 0 }
const PUNE_NSCLC: TrialQuery = {
  condition: 'non-small cell lung cancer',
  lat: 18.5204,
  lon: 73.8567,
  distanceKm: 300,
}

function client(seen: URL[] = []): CtGovClient {
  return new CtGovClient({ baseUrl: CTGOV_BASE_URL, fetch: ctgovFetch(seen), retry: FAST })
}

describe('CtGovClient.search', () => {
  it('asks for recruiting interventional trials near a point, with only the fields used', async () => {
    const seen: URL[] = []
    await client(seen).search(PUNE_NSCLC, { pageSize: 5 })

    const params = seen[0]?.searchParams
    expect(seen[0]?.pathname).toBe('/api/v2/studies')
    expect(params?.get('query.cond')).toBe('non-small cell lung cancer')
    expect(params?.get('filter.overallStatus')).toBe('RECRUITING')
    expect(params?.get('filter.geo')).toBe('distance(18.5204,73.8567,300km)')
    expect(params?.get('filter.advanced')).toBe('AREA[StudyType]INTERVENTIONAL')
    expect(params?.get('fields')).not.toContain('Contact')
  })

  it('returns a page of normalised trials and the next page token', async () => {
    const page = await client().search(PUNE_NSCLC, { pageSize: 5 })

    expect(page.trials).toHaveLength(5)
    expect(page.nextPageToken).toEqual(expect.any(String))
    expect(page.totalCount).toEqual(expect.any(Number))
    const trial = page.trials[0]
    expect(trial?.nctId).toMatch(/^NCT\d{8}$/)
    expect(trial?.title.length).toBeGreaterThan(0)
    expect(trial?.status).toBe('RECRUITING')
    expect(trial?.eligibility.sex).toMatch(/^(ALL|FEMALE|MALE)$/)
    expect(trial?.sites.length).toBeGreaterThan(0)
  })

  it('keeps no site contact details', async () => {
    const page = await client().search(PUNE_NSCLC, { pageSize: 5 })

    for (const site of page.trials.flatMap((t) => t.sites)) {
      expect(Object.keys(site).sort()).toEqual(
        ['city', 'country', 'facility', 'lat', 'lon', 'state', 'status'].sort(),
      )
    }
  })

  it('reads the next page with its token', async () => {
    const first = await client().search(PUNE_NSCLC, { pageSize: 5 })
    const second = await client().search(PUNE_NSCLC, {
      pageSize: 5,
      pageToken: first.nextPageToken ?? '',
    })

    expect(second.trials).toHaveLength(5)
    const firstIds = new Set(first.trials.map((t) => t.nctId))
    expect(second.trials.some((t) => firstIds.has(t.nctId))).toBe(false)
  })

  it('returns an empty page when nothing recruits nearby', async () => {
    const page = await client().search(
      { condition: 'glioblastoma', lat: -54.8019, lon: -68.303, distanceKm: 50 },
      { pageSize: 5 },
    )

    expect(page).toEqual({ trials: [], nextPageToken: null, totalCount: 0 })
  })

  it('skips a malformed study and keeps the rest', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const body = structuredClone(recording('search-nsclc-pune-p1').body) as {
      studies: { protocolSection: { identificationModule: { nctId: unknown } } }[]
    }
    const first = body.studies[0]
    if (first) first.protocolSection.identificationModule.nctId = 42
    const broken = new CtGovClient({
      baseUrl: CTGOV_BASE_URL,
      fetch: mockFetch(() => json(200, body)),
      retry: FAST,
    })

    expect((await broken.search(PUNE_NSCLC, { pageSize: 5 })).trials).toHaveLength(4)
  })

  it('fails when the page itself is not a search result', async () => {
    const broken = new CtGovClient({
      baseUrl: CTGOV_BASE_URL,
      fetch: mockFetch(() => json(200, { studies: 'none' })),
      retry: FAST,
    })

    await expect(broken.search(PUNE_NSCLC, { pageSize: 5 })).rejects.toBeInstanceOf(UpstreamError)
  })

  it('fails on a bad request', async () => {
    const broken = new CtGovClient({
      baseUrl: CTGOV_BASE_URL,
      fetch: mockFetch(() => json(400, 'Parameter `filter.geo` has incorrect format')),
      retry: FAST,
    })

    await expect(broken.search(PUNE_NSCLC, { pageSize: 5 })).rejects.toThrow(/HTTP 400/)
  })
})

describe('CtGovClient.study', () => {
  it('returns one normalised trial', async () => {
    const trial = await client().study('NCT06563999')

    expect(trial).toMatchObject({
      nctId: 'NCT06563999',
      phases: ['PHASE2'],
      sponsor: 'Sun Yat-sen University',
      status: 'RECRUITING',
      eligibility: { sex: 'ALL', minimumAgeYears: 18, maximumAgeYears: 75 },
    })
    expect(trial?.eligibility.criteria).toMatch(/^Inclusion Criteria:/)
    expect(trial?.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(trial?.sites[0]).toEqual({
      facility: 'Sun Yat-sen University Cancer Center',
      city: 'Guangzhou',
      state: 'Guangdong',
      country: 'China',
      status: 'RECRUITING',
      lat: 23.11667,
      lon: 113.25,
    })
  })

  it('returns null for a trial that does not exist', async () => {
    expect(await client().study('NCT09999999')).toBeNull()
  })

  it('refuses an ID that is not an NCT number without calling upstream', async () => {
    const seen: URL[] = []
    await expect(client(seen).study('NCT123')).rejects.toThrow('Not an NCT number: NCT123')
    expect(seen).toHaveLength(0)
  })
})
