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

  it('marks an unchanged trial as checked, and reports only the trials it wrote', async () => {
    await store(1_000).save([trial('NCT00000001'), trial('NCT00000002')])
    const written = await store(2_000).save([
      trial('NCT00000001'),
      trial('NCT00000002', { lastUpdated: '2026-09-20' }),
      trial('NCT00000003'),
    ])

    expect(written.map((t) => t.nctId)).toEqual(['NCT00000002', 'NCT00000003'])
    const rows = await createDb(env.DB)
      .select({ id: trials.nct_id, fetched: trials.fetched_at, checked: trials.checked_at })
      .from(trials)
      .orderBy(trials.nct_id)
    expect(rows).toEqual([
      { id: 'NCT00000001', fetched: 1_000, checked: 2_000 },
      { id: 'NCT00000002', fetched: 2_000, checked: 2_000 },
      { id: 'NCT00000003', fetched: 2_000, checked: 2_000 },
    ])
  })

  it('lists trials to refresh, least recently checked first, after a cursor', async () => {
    await store(3_000).save([trial('NCT00000001')])
    await store(1_000).save([trial('NCT00000003'), trial('NCT00000002')])
    await store(2_000).save([trial('NCT00000004')])
    const s = store()

    const first = await s.stale({ checkedBefore: 2_500, after: null, limit: 2 })
    expect(first.map((t) => t.nctId)).toEqual(['NCT00000002', 'NCT00000003'])
    const rest = await s.stale({ checkedBefore: 2_500, after: first.at(-1) ?? null, limit: 2 })
    expect(rest).toEqual([{ nctId: 'NCT00000004', checkedAt: 2_000 }])
  })

  it('finds saved recruiting trials by condition terms, most recently checked first', async () => {
    await store(1_000).save([
      trial('NCT00000001', { conditions: ['Non-Small-Cell Lung Carcinoma'] }),
      trial('NCT00000002', { conditions: ['Breast Cancer'], title: 'A lung study' }),
      trial('NCT00000003', { conditions: ['Lung Cancer'], status: 'COMPLETED' }),
    ])
    await store(2_000).save([trial('NCT00000004', { conditions: ['NON-SMALL CELL LUNG CANCER'] })])
    const s = store()

    const lung = await s.recruiting(['non', 'small', 'lung'], { limit: 10, after: null })
    expect(lung.map((r) => [r.trial.nctId, r.checkedAt])).toEqual([
      ['NCT00000004', 2_000],
      ['NCT00000001', 1_000],
    ])
    expect(lung[1]?.trial).toEqual(
      trial('NCT00000001', { conditions: ['Non-Small-Cell Lung Carcinoma'] }),
    )
    // The title counts too.
    expect(
      (await s.recruiting(['lung'], { limit: 10, after: null })).map((r) => r.trial.nctId),
    ).toEqual(['NCT00000004', 'NCT00000001', 'NCT00000002'])
    expect(await s.recruiting([], { limit: 10, after: null })).toHaveLength(3)
    // In pages, after the last row of the one before.
    const first = await s.recruiting(['lung'], { limit: 2, after: null })
    const last = first.at(-1)
    const next = await s.recruiting(['lung'], {
      limit: 2,
      after: last === undefined ? null : { nctId: last.trial.nctId, checkedAt: last.checkedAt },
    })
    expect([...first, ...next].map((r) => r.trial.nctId)).toEqual([
      'NCT00000004',
      'NCT00000001',
      'NCT00000002',
    ])
  })

  it('removes trials and their criteria', async () => {
    const s = store()
    await s.save([trial('NCT00000001'), trial('NCT00000002')])
    await s.criteriaFor([trial('NCT00000001'), trial('NCT00000002')])

    await s.remove(['NCT00000001'], 2_000)

    expect(await s.find('NCT00000001')).toBeNull()
    expect(await s.find('NCT00000002')).not.toBeNull()
    const left = await createDb(env.DB).select({ id: criteria.nct_id }).from(criteria)
    expect(new Set(left.map((r) => r.id))).toEqual(new Set(['NCT00000002']))
  })

  it('keeps a trial checked since the refresh read it', async () => {
    await store(1_000).save([trial('NCT00000001'), trial('NCT00000002')])
    await store(1_000).criteriaFor([trial('NCT00000001'), trial('NCT00000002')])
    // A search saw NCT00000002 recruiting after the refresh started at 1_500.
    await store(2_000).save([trial('NCT00000002')])

    await store().remove(['NCT00000001', 'NCT00000002'], 1_500)

    expect(await store().find('NCT00000001')).toBeNull()
    expect(await store().find('NCT00000002')).not.toBeNull()
    const left = await createDb(env.DB).select({ id: criteria.nct_id }).from(criteria)
    expect(new Set(left.map((r) => r.id))).toEqual(new Set(['NCT00000002']))
  })

  it('never replaces a saved trial with an older version of it', async () => {
    await store(1_000).save([trial('NCT00000001', { lastUpdated: '2026-09-20' })])

    const written = await store(2_000).save([
      trial('NCT00000001', { lastUpdated: '2026-09-01', title: 'A slow, older read' }),
    ])

    expect(written).toEqual([])
    const row = await createDb(env.DB).query.trials.findFirst({
      where: eq(trials.nct_id, 'NCT00000001'),
    })
    expect(row).toMatchObject({ version: '2026-09-20', title: 'Trial NCT00000001' })
    expect(row?.checked_at).toBe(1_000)
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
