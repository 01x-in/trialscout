import {
  createScheduledController,
  createExecutionContext,
  waitOnExecutionContext,
} from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CtGovClient } from '../src/clients/ctgov.ts'
import { CTGOV_BASE_URL } from '../src/clients/ctgov-query.ts'
import { createDb } from '../src/db/index.ts'
import { criteria, trials } from '../src/db/schema.ts'
import { refreshTrials, scheduledRefresh } from '../src/refresh.ts'
import { TrialStore } from '../src/store.ts'
import type { Trial } from '../src/trial.ts'
import { FAST, NOW, type TestOptions, testServices } from './helpers.ts'
import { ctgovFetch, json, mockFetch, recording } from './recorded.ts'

type RawStudy = {
  protocolSection: {
    identificationModule: { nctId: string }
    statusModule: { overallStatus: string; lastUpdatePostDateStruct?: { date: string } }
    eligibilityModule?: { eligibilityCriteria?: string }
  }
}

const SAVED_AT = NOW - 86_400_000

// The five trials of the first recorded Pune NSCLC page, as ClinicalTrials.gov sent them.
function recordedStudies(): RawStudy[] {
  return structuredClone(
    (recording('search-nsclc-pune-p1').body as { studies: RawStudy[] }).studies,
  )
}

function idOf(study: RawStudy): string {
  return study.protocolSection.identificationModule.nctId
}

/** ClinicalTrials.gov answering `filter.ids` requests from these studies. */
function registry(studies: RawStudy[], seen: string[][] = []): TestOptions['fetch'] {
  return mockFetch((url) => {
    const ids = url.searchParams.get('filter.ids')?.split('|') ?? []
    seen.push(ids)
    return json(200, { studies: studies.filter((s) => ids.includes(idOf(s))) })
  })
}

// Saves the recorded trials, split, a day before the refresh runs.
async function seed(): Promise<Trial[]> {
  const client = new CtGovClient({ baseUrl: CTGOV_BASE_URL, fetch: ctgovFetch(), retry: FAST })
  const page = await client.search(
    { condition: 'non-small cell lung cancer', lat: 18.5204, lon: 73.8567, distanceKm: 300 },
    { pageSize: 5 },
  )
  const store = new TrialStore(createDb(env.DB), () => SAVED_AT)
  await store.save(page.trials)
  await store.criteriaFor(page.trials)
  return page.trials
}

function services(options: TestOptions) {
  return testServices(options)(env)
}

let saved: Trial[] = []

beforeEach(async () => {
  saved = await seed()
})

describe('refreshTrials', () => {
  it('re-splits changed trials, removes closed and vanished ones, and marks the rest checked', async () => {
    const studies = recordedStudies()
    const [changed, closed, vanished] = studies
    if (changed === undefined || closed === undefined || vanished === undefined) {
      throw new Error('Expected five recorded studies')
    }
    changed.protocolSection.statusModule.lastUpdatePostDateStruct = { date: '2026-09-25' }
    changed.protocolSection.eligibilityModule = {
      eligibilityCriteria:
        'Inclusion Criteria:\n\n* A new rule\n\nExclusion Criteria:\n\n* Another',
    }
    closed.protocolSection.statusModule.overallStatus = 'ACTIVE_NOT_RECRUITING'
    const present = studies.filter((s) => s !== vanished)

    const report = await refreshTrials(services({ fetch: registry(present) }))

    expect(report).toEqual({ checked: 5, changed: 1, removed: 2 })
    const db = createDb(env.DB)
    const rows = await db
      .select({ id: trials.nct_id, fetched: trials.fetched_at, checked: trials.checked_at })
      .from(trials)
      .orderBy(trials.nct_id)
    expect(rows.map((r) => r.id)).toEqual(
      saved
        .map((t) => t.nctId)
        .filter((id) => id !== idOf(closed) && id !== idOf(vanished))
        .sort(),
    )
    for (const row of rows) {
      expect(row.checked).toBe(NOW)
      expect(row.fetched).toBe(row.id === idOf(changed) ? NOW : SAVED_AT)
    }
    const split = await db
      .select({ version: criteria.version, text: criteria.text })
      .from(criteria)
      .where(eq(criteria.nct_id, idOf(changed)))
      .orderBy(criteria.position)
    expect(split).toEqual([
      { version: '2026-09-25', text: 'A new rule' },
      { version: '2026-09-25', text: 'Another' },
    ])
    const gone = await db
      .select()
      .from(criteria)
      .where(eq(criteria.nct_id, idOf(closed)))
    expect(gone).toEqual([])
  })

  it('walks the oldest-checked trials in batches, and leaves the rest for the next run', async () => {
    const seen: string[][] = []
    const report = await refreshTrials(
      services({
        fetch: registry(recordedStudies(), seen),
        refresh: { batchSize: 2, maxBatches: 2 },
      }),
    )

    expect(report).toEqual({ checked: 4, changed: 0, removed: 0 })
    expect(seen).toEqual([
      saved
        .map((t) => t.nctId)
        .sort()
        .slice(0, 2),
      saved
        .map((t) => t.nctId)
        .sort()
        .slice(2, 4),
    ])
    const next = await refreshTrials(
      services({
        fetch: registry(recordedStudies(), seen),
        refresh: { batchSize: 2, maxBatches: 2 },
      }),
    )
    // The run starts at NOW again: the trials it already checked are not due.
    expect(next).toEqual({ checked: 1, changed: 0, removed: 0 })
  })

  it('keeps trials it could not read when a study comes back malformed', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const studies = recordedStudies()
    const [broken] = studies
    if (broken === undefined) throw new Error('Expected five recorded studies')
    const brokenId = idOf(broken)
    ;(broken.protocolSection.identificationModule as { nctId: unknown }).nctId = 42

    const report = await refreshTrials(services({ fetch: mockFetch(() => json(200, { studies })) }))

    expect(report).toEqual({ checked: 4, changed: 0, removed: 0 })
    const row = await createDb(env.DB).query.trials.findFirst({
      where: eq(trials.nct_id, brokenId),
    })
    // Still there, and still due: tomorrow's run tries it first.
    expect(row?.checked_at).toBe(SAVED_AT)
  })

  it('does nothing when no trial is saved', async () => {
    await createDb(env.DB).delete(trials)
    const seen: string[][] = []

    expect(await refreshTrials(services({ fetch: registry([], seen) }))).toEqual({
      checked: 0,
      changed: 0,
      removed: 0,
    })
    expect(seen).toEqual([])
  })
})

describe('scheduledRefresh', () => {
  it('runs the refresh from the cron trigger and logs only counts', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const handler = scheduledRefresh(testServices({ fetch: registry(recordedStudies()) }))
    const ctx = createExecutionContext()

    await handler(createScheduledController({ cron: '17 3 * * *' }), env, ctx)
    await waitOnExecutionContext(ctx)

    expect(log).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledWith('Trial refresh: checked 5, changed 0, removed 0')
  })
})
