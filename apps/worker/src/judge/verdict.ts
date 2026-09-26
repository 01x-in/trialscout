import type { CriterionKind, Verdict, VerdictCounts } from '@trialscout/contract'

// Jev's answer to a criterion question as a verdict. Missing information and low confidence
// both give "ask your doctor", never a guessed pass or fail. The thresholds are the M1.3
// starting values (docs/jev-budget.md); GATE 1 sets the real ones. Failing needs more
// confidence than meeting, because a false "likely fails" is the worst failure mode.
export const THRESHOLDS = { fails: 0.9, meets: 0.8, notApplicable: 0.8 } as const

export type Answer = { choice: string; confidence: number }

export function toVerdict(
  kind: CriterionKind,
  answer: Answer | null,
): Exclude<Verdict, 'not_checked'> {
  if (answer === null) return 'ask_your_doctor'
  const { choice, confidence } = answer
  const fails = kind === 'inclusion' ? 'does_not_meet' : 'applies'
  const meets = kind === 'inclusion' ? 'meets' : 'does_not_apply'
  if (choice === fails) return confidence >= THRESHOLDS.fails ? 'likely_fails' : 'ask_your_doctor'
  if (choice === meets) return confidence >= THRESHOLDS.meets ? 'likely_meets' : 'ask_your_doctor'
  if (choice === 'not_applicable') {
    return confidence >= THRESHOLDS.notApplicable ? 'not_applicable' : 'ask_your_doctor'
  }
  return 'ask_your_doctor'
}

/** An unsplittable trial counts as one "ask your doctor": its raw text is shown instead. */
export const UNSPLITTABLE_COUNTS: VerdictCounts = {
  likely_meets: 0,
  likely_fails: 0,
  ask_your_doctor: 1,
  not_checked: 0,
}

/** Counts shown on a result card; not-applicable criteria are left out. */
export function countVerdicts(verdicts: Verdict[]): VerdictCounts {
  const counts: VerdictCounts = {
    likely_meets: 0,
    likely_fails: 0,
    ask_your_doctor: 0,
    not_checked: 0,
  }
  for (const verdict of verdicts) if (verdict !== 'not_applicable') counts[verdict] += 1
  return counts
}
