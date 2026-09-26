import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { createDb } from '../src/db/index.ts'
import { criteria, trials } from '../src/db/schema.ts'
import { TrialStore } from '../src/store.ts'
import type { Trial } from '../src/trial.ts'

const ELIGIBILITY =
  'Inclusion Criteria:\n\n* Age 18+\n* Stage IV\n\nExclusion Criteria:\n\n* Pregnant'

function trial(nctId: string, overrides: Partial<Trial> = {}): Trial {
  return {
    nctId,
    title: `Trial ${nctId}`,
    phases: ['PHASE2'],
    sponsor: 'Sponsor',
    conditions: ['NSCLC'],
    status: 'RECRUITING',
    lastUpdated: '2026-09-01',
    eligibility: { criteria: ELIGIBILITY, sex: 'ALL', minimumAgeYears: 18, maximumAgeYears: null },
    sites: [
      {
        facility: 'Centre',
        city: 'Pune',
        state: null,
        country: 'India',
        status: 'RECRUITING',
        lat: 18.52,
        lon: 73.86,
      },
    ],
    ...overrides,
  }
}

function store(now = 1_000): TrialStore {
  return new TrialStore(createDb(env.DB), () => now)
}

describe('TrialStore', () => {
  it('saves a trial with its sites', async () => {
    await store().save([trial('NCT00000001')])

    const row = await createDb(env.DB).query.trials.findFirst({
      where: eq(trials.nct_id, 'NCT00000001'),
    })
    expect(row).toMatchObject({ version: '2026-09-01', fetched_at: 1_000, split_version: null })
    expect(row?.sites).toHaveLength(1)
  })

  it('finds a saved trial with the time it was fetched', async () => {
    await store(2_000).save([trial('NCT00000001')])

    expect(await store().find('NCT00000001')).toEqual({
      trial: trial('NCT00000001'),
      fetchedAt: 2_000,
    })
    expect(await store().find('NCT00000002')).toBeNull()
  })

  it('splits a trial once per version and reads the split back from D1', async () => {
    const s = store()
    await s.save([trial('NCT00000001')])

    const first = await s.criteriaFor([trial('NCT00000001')])
    expect(first.get('NCT00000001')).toEqual({
      ok: true,
      criteria: [
        { kind: 'inclusion', text: 'Age 18+', group: null },
        { kind: 'inclusion', text: 'Stage IV', group: null },
        { kind: 'exclusion', text: 'Pregnant', group: null },
      ],
    })
    // The stored split is used even though the text passed in now differs.
    const changedText = trial('NCT00000001', {
      eligibility: {
        criteria: 'nonsense',
        sex: 'ALL',
        minimumAgeYears: null,
        maximumAgeYears: null,
      },
    })
    expect((await s.criteriaFor([changedText])).get('NCT00000001')).toEqual(
      first.get('NCT00000001'),
    )
  })

  it('re-splits a new version and drops the old criteria', async () => {
    const s = store()
    await s.save([trial('NCT00000001')])
    await s.criteriaFor([trial('NCT00000001')])

    const updated = trial('NCT00000001', {
      lastUpdated: '2026-09-20',
      eligibility: {
        criteria: 'Inclusion Criteria:\n\n* Age 21+\n\nExclusion Criteria:\n\n* HIV',
        sex: 'ALL',
        minimumAgeYears: 21,
        maximumAgeYears: null,
      },
    })
    await s.save([updated])
    const split = (await s.criteriaFor([updated])).get('NCT00000001')

    expect(split).toEqual({
      ok: true,
      criteria: [
        { kind: 'inclusion', text: 'Age 21+', group: null },
        { kind: 'exclusion', text: 'HIV', group: null },
      ],
    })
    const rows = await createDb(env.DB).select().from(criteria)
    expect(rows.every((r) => r.version === '2026-09-20')).toBe(true)
  })

  it('does not rewrite a trial whose version is unchanged', async () => {
    await store(1_000).save([trial('NCT00000001')])
    await store(2_000).save([trial('NCT00000001', { title: 'Renamed without a new version' })])

    const row = await createDb(env.DB).query.trials.findFirst({
      where: eq(trials.nct_id, 'NCT00000001'),
    })
    expect(row?.fetched_at).toBe(1_000)
  })

  it('reports a trial that cannot be split', async () => {
    const s = store()
    const raw = trial('NCT00000002', {
      eligibility: {
        criteria: 'Age 18+. Not pregnant.',
        sex: 'ALL',
        minimumAgeYears: null,
        maximumAgeYears: null,
      },
    })
    await s.save([raw])

    expect((await s.criteriaFor([raw])).get('NCT00000002')).toEqual({
      ok: false,
      reason: 'no_sections',
    })
  })

  it('handles many trials at once within D1 limits', async () => {
    const many = Array.from({ length: 120 }, (_, i) => trial(`NCT${String(i).padStart(8, '0')}`))
    const s = store()
    await s.save(many)
    const splits = await s.criteriaFor(many)

    expect(splits.size).toBe(120)
    expect(await createDb(env.DB).select().from(criteria)).toHaveLength(360)
  })
})
