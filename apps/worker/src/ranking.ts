import type { VerdictCounts } from '@trialscout/contract'

// Orders search results. A false "likely fails" is the worst failure mode, so a failing
// trial sinks but is never removed.
//   1. Trials with no likely fails before trials with any; among failing trials, fewer fails.
//   2. A smaller share of unknown criteria ("ask your doctor" and "not checked yet"). A
//      share, not a count, so short trials do not win by having fewer criteria; and "not
//      checked yet" counts as unknown so a trial the budget never reached cannot rank first.
//   3. The nearer recruiting site; unknown distance last.
//   4. The NCT ID, so equal trials keep a stable order.

export type Rankable = { nctId: string; counts: VerdictCounts; distanceKm: number | null }

function unknownShare(c: VerdictCounts): number {
  const total = c.likely_meets + c.likely_fails + c.ask_your_doctor + c.not_checked
  return total === 0 ? 1 : (c.ask_your_doctor + c.not_checked) / total
}

function compare(a: Rankable, b: Rankable): number {
  const aFails = a.counts.likely_fails > 0
  const bFails = b.counts.likely_fails > 0
  if (aFails !== bFails) return aFails ? 1 : -1
  if (aFails && a.counts.likely_fails !== b.counts.likely_fails) {
    return a.counts.likely_fails - b.counts.likely_fails
  }
  const share = unknownShare(a.counts) - unknownShare(b.counts)
  if (share !== 0) return share
  const aDistance = a.distanceKm ?? Number.POSITIVE_INFINITY
  const bDistance = b.distanceKm ?? Number.POSITIVE_INFINITY
  if (aDistance !== bDistance) return aDistance - bDistance
  return a.nctId < b.nctId ? -1 : a.nctId > b.nctId ? 1 : 0
}

/** The trials in rank order, as a new array; none is ever removed. */
export function rankTrials<T extends Rankable>(trials: T[]): T[] {
  return [...trials].sort(compare)
}
