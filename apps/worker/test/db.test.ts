import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { createDb } from '../src/db/index.ts'
import { cities, cityNames, criteria, sites, trials } from '../src/db/schema.ts'

const TRIAL = {
  nct_id: 'NCT06563999',
  version: '2026-04-21',
  title: 'Neoadjuvant Umbrella Trial',
  phases: ['PHASE2'],
  sponsor: 'Sun Yat-sen University',
  conditions: ['Lung Cancer Stage III'],
  status: 'RECRUITING',
  criteria: 'Inclusion Criteria:\n\n* Aged 18-75 years',
  sex: 'ALL' as const,
  min_age_years: 18,
  max_age_years: 75,
  split_version: '2026-04-21',
  split_ok: true,
  fetched_at: 1_790_000_000_000,
}

describe('D1 schema (Drizzle migrations)', () => {
  it('stores a trial with its sites and criteria', async () => {
    const db = createDb(env.DB)
    await db.batch([
      db.insert(trials).values(TRIAL),
      db.insert(sites).values({
        nct_id: TRIAL.nct_id,
        facility: 'Sun Yat-sen University Cancer Center',
        city: 'Guangzhou',
        state: 'Guangdong',
        country: 'China',
        status: 'RECRUITING',
        lat: 23.11667,
        lon: 113.25,
      }),
      db.insert(criteria).values({
        nct_id: TRIAL.nct_id,
        version: TRIAL.version,
        position: 0,
        kind: 'inclusion',
        text: 'Aged 18-75 years',
      }),
    ])

    const stored = await db.query.trials.findFirst({ where: eq(trials.nct_id, TRIAL.nct_id) })
    expect(stored).toEqual(TRIAL)
    expect(await db.select().from(sites)).toHaveLength(1)
    expect(await db.select().from(criteria)).toHaveLength(1)
  })

  it('removes sites and criteria with their trial', async () => {
    const db = createDb(env.DB)
    await db.insert(trials).values(TRIAL)
    await db.insert(sites).values({ nct_id: TRIAL.nct_id, city: 'Guangzhou', lat: 1, lon: 2 })
    await db.insert(criteria).values({
      nct_id: TRIAL.nct_id,
      version: TRIAL.version,
      position: 0,
      kind: 'exclusion',
      text: 'Pregnant',
    })

    await db.delete(trials).where(eq(trials.nct_id, TRIAL.nct_id))

    expect(await db.select().from(sites)).toEqual([])
    expect(await db.select().from(criteria)).toEqual([])
  })

  it('finds a city by any of its names', async () => {
    const db = createDb(env.DB)
    await db.insert(cities).values({
      geonameid: 1275339,
      name: 'Mumbai',
      country_code: 'IN',
      lat: 19.07283,
      lon: 72.88261,
      population: 12691836,
    })
    await db.insert(cityNames).values([
      { key: 'mumbai', geonameid: 1275339 },
      { key: 'bombay', geonameid: 1275339 },
    ])

    const found = await db
      .select({ name: cities.name })
      .from(cityNames)
      .innerJoin(cities, eq(cities.geonameid, cityNames.geonameid))
      .where(eq(cityNames.key, 'bombay'))
    expect(found).toEqual([{ name: 'Mumbai' }])
  })
})
