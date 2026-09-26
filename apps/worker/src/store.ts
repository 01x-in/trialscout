import { and, eq, inArray, ne } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { type Criterion, type Split, splitCriteria } from './criteria.ts'
import type { Db } from './db/index.ts'
import { criteria, trials } from './db/schema.ts'
import type { Trial } from './trial.ts'

// Cached ClinicalTrials.gov trials and their split criteria in D1. A trial is written only
// when its version (lastUpdatePostDate) is new, and split once per version for all users.

// D1 allows 100 bound parameters per statement.
const IN_CHUNK = 90
const CRITERIA_ROWS = 14 // 7 columns
// Statements per D1 batch call.
const BATCH = 50

function chunk<T>(rows: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size))
  return out
}

function version(trial: Trial): string {
  return trial.lastUpdated ?? ''
}

export class TrialStore {
  readonly #db: Db
  readonly #now: () => number

  constructor(db: Db, now: () => number = Date.now) {
    this.#db = db
    this.#now = now
  }

  async #run(statements: BatchItem<'sqlite'>[]): Promise<void> {
    for (const part of chunk(statements, BATCH)) {
      const [first, ...rest] = part
      if (first !== undefined) await this.#db.batch([first, ...rest])
    }
  }

  async #versions(
    ids: string[],
  ): Promise<Map<string, { version: string; split: string | null; ok: boolean | null }>> {
    const found = new Map<string, { version: string; split: string | null; ok: boolean | null }>()
    for (const part of chunk(ids, IN_CHUNK)) {
      const rows = await this.#db
        .select({
          id: trials.nct_id,
          version: trials.version,
          split: trials.split_version,
          ok: trials.split_ok,
        })
        .from(trials)
        .where(inArray(trials.nct_id, part))
      for (const row of rows)
        found.set(row.id, { version: row.version, split: row.split, ok: row.ok })
    }
    return found
  }

  /** A saved trial and when it was fetched, or null when it has never been saved. */
  async find(nctId: string): Promise<{ trial: Trial; fetchedAt: number } | null> {
    const [row] = await this.#db.select().from(trials).where(eq(trials.nct_id, nctId)).limit(1)
    if (row === undefined) return null
    return {
      trial: {
        nctId: row.nct_id,
        title: row.title,
        phases: row.phases,
        sponsor: row.sponsor,
        conditions: row.conditions,
        status: row.status,
        lastUpdated: row.version === '' ? null : row.version,
        eligibility: {
          criteria: row.criteria,
          sex: row.sex,
          minimumAgeYears: row.min_age_years,
          maximumAgeYears: row.max_age_years,
        },
        sites: row.sites,
      },
      fetchedAt: row.fetched_at,
    }
  }

  /** Writes trials whose version is new; unchanged trials are left as they are. */
  async save(list: Trial[]): Promise<void> {
    const known = await this.#versions(list.map((t) => t.nctId))
    const now = this.#now()
    const statements: BatchItem<'sqlite'>[] = []
    for (const trial of list) {
      if (known.get(trial.nctId)?.version === version(trial)) continue
      const row = {
        nct_id: trial.nctId,
        version: version(trial),
        title: trial.title,
        phases: trial.phases,
        sponsor: trial.sponsor,
        conditions: trial.conditions,
        status: trial.status,
        criteria: trial.eligibility.criteria,
        sex: trial.eligibility.sex,
        min_age_years: trial.eligibility.minimumAgeYears,
        max_age_years: trial.eligibility.maximumAgeYears,
        sites: trial.sites,
        split_version: null,
        split_ok: null,
        fetched_at: now,
      }
      const { nct_id: _id, ...update } = row
      statements.push(
        this.#db
          .insert(trials)
          .values(row)
          .onConflictDoUpdate({ target: trials.nct_id, set: update }),
      )
      statements.push(
        this.#db
          .delete(criteria)
          .where(and(eq(criteria.nct_id, trial.nctId), ne(criteria.version, version(trial)))),
      )
    }
    await this.#run(statements)
  }

  /** Each trial's criteria: the stored split for its version, or a new split, stored. */
  async criteriaFor(list: Trial[]): Promise<Map<string, Split>> {
    const known = await this.#versions(list.map((t) => t.nctId))
    const splits = new Map<string, Split>()

    const stored = list.filter((t) => {
      const k = known.get(t.nctId)
      return k !== undefined && k.split === version(t) && k.ok === true
    })
    for (const part of chunk(
      stored.map((t) => t.nctId),
      IN_CHUNK,
    )) {
      const rows = await this.#db
        .select()
        .from(criteria)
        .where(inArray(criteria.nct_id, part))
        .orderBy(criteria.nct_id, criteria.position)
      for (const row of rows) {
        const trial = stored.find((t) => t.nctId === row.nct_id)
        if (trial === undefined || row.version !== version(trial)) continue
        const split = splits.get(row.nct_id)
        const criterion: Criterion = { kind: row.kind, text: row.text, group: row.group }
        if (split?.ok) split.criteria.push(criterion)
        else splits.set(row.nct_id, { ok: true, criteria: [criterion] })
      }
    }

    const statements: BatchItem<'sqlite'>[] = []
    const rows: (typeof criteria.$inferInsert)[] = []
    for (const trial of list) {
      if (splits.has(trial.nctId)) continue
      const split = splitCriteria(trial.eligibility.criteria)
      splits.set(trial.nctId, split)
      // Only a trial saved at this version gets its split stored.
      if (known.get(trial.nctId)?.version !== version(trial)) continue
      if (split.ok) {
        split.criteria.forEach((c, position) =>
          rows.push({ nct_id: trial.nctId, version: version(trial), position, ...c }),
        )
      }
      statements.push(
        this.#db
          .update(trials)
          .set({ split_version: version(trial), split_ok: split.ok })
          .where(eq(trials.nct_id, trial.nctId)),
      )
    }
    for (const part of chunk(rows, CRITERIA_ROWS)) {
      statements.unshift(this.#db.insert(criteria).values(part).onConflictDoNothing())
    }
    await this.#run(statements)
    return splits
  }
}
