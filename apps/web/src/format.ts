import type { Profile, VerdictCounts } from '@trialscout/contract'

/** "Phase 2", "Phase 1/2", "Early phase 1"; null when ClinicalTrials.gov gives no phase. */
export function phaseLabel(phases: string[]): string | null {
  if (phases.includes('EARLY_PHASE1')) return 'Early phase 1'
  const numbers = phases
    .map((p) => /^PHASE(\d)$/.exec(p)?.[1])
    .filter((n): n is string => n !== undefined)
    .sort()
  return numbers.length === 0 ? null : `Phase ${numbers.join('/')}`
}

export type CountVerdict = keyof VerdictCounts

export type CountPart = { verdict: CountVerdict; count: number; label: string }

/** The label shown for each verdict, always next to its icon. */
export const VERDICT_LABELS: Record<CountVerdict, string> = {
  likely_meets: 'likely meets',
  likely_fails: 'likely fails',
  ask_your_doctor: 'ask your doctor',
  not_checked: 'not checked yet',
}

// Verdicts are told apart by icon and label, never by colour alone.
export const VERDICT_ICONS: Record<CountVerdict, string> = {
  likely_meets: '✓',
  likely_fails: '✕',
  ask_your_doctor: '?',
  not_checked: '…',
}

const ORDER: CountVerdict[] = ['likely_meets', 'likely_fails', 'ask_your_doctor', 'not_checked']

/** The non-zero counts, in a fixed order, each with its label. */
export function countParts(counts: VerdictCounts): CountPart[] {
  return ORDER.filter((verdict) => counts[verdict] > 0).map((verdict) => ({
    verdict,
    count: counts[verdict],
    label: `${counts[verdict]} ${VERDICT_LABELS[verdict]}`,
  }))
}

/** "26 September 2026", for "data as of". */
export function dateLabel(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/** "breast cancer, stage II, age 47, female.", as the patient entered it. */
export function profileSummary(profile: Profile): string {
  const stage = profile.stage === 'unknown' ? 'stage not known' : `stage ${profile.stage}`
  const sex = profile.sex === 'other' ? 'sex other' : profile.sex
  return `${profile.cancerType}, ${stage}, age ${profile.age}, ${sex}.`
}

/** The furthest a search reaches (Profile.maxDistanceKm's limit): about half the way round
 * the Earth, so no trial site is further. The form offers it as "Any distance". */
export const ANY_DISTANCE_KM = 20000

/** What the distance field shows for ANY_DISTANCE_KM; the search itself gets the number. */
export const ANY_DISTANCE_LABEL = 'Any distance'

/** The distance field's text for a distance: "300", or "Any distance". */
export function distanceText(km: number): string {
  return km >= ANY_DISTANCE_KM ? ANY_DISTANCE_LABEL : String(km)
}

/** "within 300 km of Pune", or "at any distance from Pune". */
export function whereLabel(maxDistanceKm: number, city: string): string {
  return maxDistanceKm >= ANY_DISTANCE_KM
    ? `at any distance from ${city}`
    : `within ${maxDistanceKm} km of ${city}`
}
