import { ANY_DISTANCE_KM } from '@trialscout/contract'
import { describe, expect, it } from 'vitest'
import {
  applyHardFilters,
  explainEmpty,
  type HardFilterInput,
  searchRadiusKm,
} from '../src/filters.ts'
import { haversineKm } from '../src/geo/distance.ts'
import type { Site, Trial } from '../src/trial.ts'

const PUNE = { lat: 18.5204, lon: 73.8567 }
const MUMBAI = { lat: 19.07283, lon: 72.88261 }
const DELHI = { lat: 28.6139, lon: 77.209 }

function site(at: { lat: number; lon: number } | null, status: string | null = 'RECRUITING'): Site {
  return {
    facility: 'Cancer Centre',
    city: 'Somewhere',
    state: null,
    country: 'India',
    status,
    lat: at?.lat ?? null,
    lon: at?.lon ?? null,
  }
}

function trial(
  nctId: string,
  overrides: Partial<Trial> = {},
  sites: Site[] = [site(MUMBAI)],
): Trial {
  return {
    nctId,
    title: `Trial ${nctId}`,
    phases: ['PHASE2'],
    sponsor: 'Sponsor',
    conditions: ['Lung Cancer'],
    status: 'RECRUITING',
    lastUpdated: '2026-09-01',
    eligibility: { criteria: null, sex: 'ALL', minimumAgeYears: 18, maximumAgeYears: null },
    sites,
    ...overrides,
  }
}

const PATIENT: HardFilterInput = { age: 58, sex: 'female', origin: PUNE, maxDistanceKm: 200 }

describe('haversineKm', () => {
  it.each([
    [PUNE, PUNE, 0],
    [PUNE, MUMBAI, 120],
    [PUNE, DELHI, 1175],
  ])('measures %j to %j as about %d km', (a, b, km) => {
    expect(haversineKm(a, b)).toBeCloseTo(km, -1)
  })
})

describe('applyHardFilters', () => {
  it('keeps a trial within reach and names its nearest recruiting site', () => {
    const { kept, removed } = applyHardFilters(
      [trial('NCT00000001', {}, [site(DELHI), site(MUMBAI)])],
      PATIENT,
    )

    expect(removed).toEqual({ status: 0, age: 0, sex: 0, distance: 0 })
    expect(kept).toHaveLength(1)
    expect(kept[0]?.nearestSite?.lat).toBe(MUMBAI.lat)
    expect(kept[0]?.nearestSite?.distanceKm).toBeCloseTo(120, -1)
  })

  it.each<[string, Trial, keyof ReturnType<typeof applyHardFilters>['removed']]>([
    ['not recruiting', trial('NCT00000002', { status: 'COMPLETED' }), 'status'],
    [
      'too young for the trial',
      trial('NCT00000003', {
        eligibility: { criteria: null, sex: 'ALL', minimumAgeYears: 60, maximumAgeYears: null },
      }),
      'age',
    ],
    [
      'too old for the trial',
      trial('NCT00000004', {
        eligibility: { criteria: null, sex: 'ALL', minimumAgeYears: 18, maximumAgeYears: 55 },
      }),
      'age',
    ],
    [
      'the other sex',
      trial('NCT00000005', {
        eligibility: { criteria: null, sex: 'MALE', minimumAgeYears: 18, maximumAgeYears: null },
      }),
      'sex',
    ],
    ['every recruiting site too far away', trial('NCT00000006', {}, [site(DELHI)]), 'distance'],
    [
      'no site recruiting yet',
      trial('NCT00000007', {}, [site(MUMBAI, 'NOT_YET_RECRUITING')]),
      'distance',
    ],
  ])('removes a trial that is %s', (_label, t, reason) => {
    const { kept, removed } = applyHardFilters([t], PATIENT)

    expect(kept).toEqual([])
    expect(removed[reason]).toBe(1)
  })

  // "Other" is neither female nor male: a trial for one sex is not an assumed fail, so it
  // stays in, and its card tells the patient to ask their doctor.
  it('keeps trials for either sex when the patient chose "other"', () => {
    const forWomen = trial('NCT00000011', {
      eligibility: { criteria: null, sex: 'FEMALE', minimumAgeYears: 18, maximumAgeYears: null },
    })
    const forMen = trial('NCT00000012', {
      eligibility: { criteria: null, sex: 'MALE', minimumAgeYears: 18, maximumAgeYears: null },
    })

    const { kept, removed } = applyHardFilters([forWomen, forMen], { ...PATIENT, sex: 'other' })

    expect(kept.map((c) => c.trial.nctId)).toEqual(['NCT00000011', 'NCT00000012'])
    expect(removed.sex).toBe(0)
  })

  // "Any distance" (the most a profile allows) has no limit, even on the far side of the Earth.
  it('keeps a site at the antipode when the patient can travel any distance', () => {
    const antipode = { lat: -PUNE.lat, lon: PUNE.lon - 180 }
    const far = trial('NCT00000013', {}, [site(antipode)])

    expect(
      applyHardFilters([far], { ...PATIENT, maxDistanceKm: ANY_DISTANCE_KM }).kept,
    ).toHaveLength(1)
    expect(applyHardFilters([far], { ...PATIENT, maxDistanceKm: 19000 }).kept).toHaveLength(0)
  })

  it('asks ClinicalTrials.gov for more than half the way round the Earth for any distance', () => {
    expect(searchRadiusKm(ANY_DISTANCE_KM)).toBeGreaterThan(20016)
    expect(searchRadiusKm(300)).toBe(300)
  })

  it('treats the age limits as inclusive', () => {
    const edge = trial('NCT00000008', {
      eligibility: { criteria: null, sex: 'FEMALE', minimumAgeYears: 58, maximumAgeYears: 58 },
    })

    expect(applyHardFilters([edge], PATIENT).kept).toHaveLength(1)
  })

  it('keeps a trial whose recruiting sites have no coordinates, with distance unknown', () => {
    const { kept } = applyHardFilters(
      [trial('NCT00000009', {}, [site(null), site(DELHI)])],
      PATIENT,
    )

    expect(kept).toHaveLength(1)
    expect(kept[0]?.nearestSite).toBeNull()
  })

  it('counts a site with no status as recruiting', () => {
    const { kept } = applyHardFilters([trial('NCT00000010', {}, [site(MUMBAI, null)])], PATIENT)

    expect(kept[0]?.nearestSite?.distanceKm).toBeCloseTo(120, -1)
  })
})

describe('explainEmpty', () => {
  it('says nothing recruits nearby when ClinicalTrials.gov found nothing', () => {
    expect(explainEmpty(0, { status: 0, age: 0, sex: 0, distance: 0 })).toEqual({
      reason: 'none_nearby',
      relax: 'distance',
    })
  })

  it.each([
    [{ status: 0, age: 5, sex: 1, distance: 2 }, 'age'],
    [{ status: 0, age: 0, sex: 3, distance: 1 }, 'sex'],
    [{ status: 1, age: 0, sex: 0, distance: 4 }, 'no_open_site_nearby'],
  ] as const)('names the filter that removed the most trials: %j', (removed, reason) => {
    expect(explainEmpty(8, removed)).toEqual({ reason, relax: 'distance' })
  })
})
