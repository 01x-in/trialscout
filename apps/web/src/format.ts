import type { VerdictCounts } from '@trialscout/contract'

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

const LABELS: Record<CountVerdict, string> = {
  likely_meets: 'likely meets',
  likely_fails: 'likely fails',
  ask_your_doctor: 'ask your doctor',
  not_checked: 'not checked yet',
}

const ORDER: CountVerdict[] = ['likely_meets', 'likely_fails', 'ask_your_doctor', 'not_checked']

/** The non-zero counts, in a fixed order, each with its label. */
export function countParts(counts: VerdictCounts): CountPart[] {
  return ORDER.filter((verdict) => counts[verdict] > 0).map((verdict) => ({
    verdict,
    count: counts[verdict],
    label: `${counts[verdict]} ${LABELS[verdict]}`,
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
