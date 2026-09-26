import { haversineKm, type Point } from './geo/distance.ts'
import type { Site, Trial } from './trial.ts'

// Hard filters: checks that need no judgement, run in code before Jev sees a trial.
// ClinicalTrials.gov already filters by condition, recruiting status and a site within the
// distance (any site); here the trial's own age and sex limits are applied, and distance is
// measured to the nearest site that is itself recruiting.
//
// When the data is missing, a trial is kept: hiding a trial the patient could join is the
// worst failure mode. A trial whose recruiting sites have no coordinates stays in with its
// distance unknown.

export type HardFilterInput = {
  age: number
  sex: 'female' | 'male'
  origin: Point
  maxDistanceKm: number
}

export type NearestSite = Site & { distanceKm: number }

export type Candidate = { trial: Trial; nearestSite: NearestSite | null }

export type RemovedCounts = { status: number; age: number; sex: number; distance: number }

export type HardFilterResult = { kept: Candidate[]; removed: RemovedCounts }

// A site's own status; one with none is taken as recruiting, like its trial.
function recruiting(site: Site): boolean {
  return site.status === null || site.status === 'RECRUITING'
}

function nearest(sites: Site[], origin: Point): NearestSite | null {
  let best: NearestSite | null = null
  for (const site of sites) {
    if (site.lat === null || site.lon === null) continue
    const distanceKm = haversineKm(origin, { lat: site.lat, lon: site.lon })
    if (best === null || distanceKm < best.distanceKm) best = { ...site, distanceKm }
  }
  return best
}

type Removal = keyof RemovedCounts

function check(trial: Trial, input: HardFilterInput): Removal | Candidate {
  if (trial.status !== 'RECRUITING') return 'status'
  const { minimumAgeYears, maximumAgeYears, sex } = trial.eligibility
  if (minimumAgeYears !== null && input.age < minimumAgeYears) return 'age'
  if (maximumAgeYears !== null && input.age > maximumAgeYears) return 'age'
  if (sex === 'FEMALE' && input.sex !== 'female') return 'sex'
  if (sex === 'MALE' && input.sex !== 'male') return 'sex'

  const open = trial.sites.filter(recruiting)
  if (open.length === 0) return 'distance'
  const site = nearest(open, input.origin)
  if (site !== null && site.distanceKm <= input.maxDistanceKm) return { trial, nearestSite: site }
  // No mapped recruiting site is close enough, but an unmapped one might be.
  if (open.some((s) => s.lat === null || s.lon === null)) return { trial, nearestSite: null }
  return 'distance'
}

export function applyHardFilters(trials: Trial[], input: HardFilterInput): HardFilterResult {
  const kept: Candidate[] = []
  const removed: RemovedCounts = { status: 0, age: 0, sex: 0, distance: 0 }
  for (const trial of trials) {
    const result = check(trial, input)
    if (typeof result === 'string') removed[result] += 1
    else kept.push(result)
  }
  return { kept, removed }
}

export type EmptyReason = 'none_nearby' | 'age' | 'sex' | 'no_open_site_nearby'

// Only distance can be relaxed: age and sex are facts, and cancer stage is not a hard filter
// (Jev judges stage criteria), so it never empties the list.
export type EmptyExplanation = { reason: EmptyReason; relax: 'distance' }

/** Why no trial survived: the filter that removed the most, and what to widen. */
export function explainEmpty(fetched: number, removed: RemovedCounts): EmptyExplanation {
  if (fetched === 0) return { reason: 'none_nearby', relax: 'distance' }
  const ranked: [EmptyReason, number][] = [
    ['age', removed.age],
    ['sex', removed.sex],
    ['no_open_site_nearby', removed.distance + removed.status],
  ]
  ranked.sort((a, b) => b[1] - a[1])
  return { reason: ranked[0]?.[0] ?? 'none_nearby', relax: 'distance' }
}
