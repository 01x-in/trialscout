// What the app shows for each criterion. The three patient-facing verdicts are
// likely_meets, likely_fails and ask_your_doctor. not_checked means Jev has not judged it
// yet (the search budget ran out, or the trial already has a confident fail); not_applicable
// means the criterion only covers another group of patients, and it is left out of counts.
export type Verdict =
  | 'likely_meets'
  | 'likely_fails'
  | 'ask_your_doctor'
  | 'not_applicable'
  | 'not_checked'

export type CriterionKind = 'inclusion' | 'exclusion'

export type CriterionVerdict = {
  kind: CriterionKind
  // Verbatim from ClinicalTrials.gov; always shown next to the verdict.
  text: string
  group: string | null
  verdict: Verdict
  // Jev's confidence in its answer; null when not checked.
  confidence: number | null
}

export type VerdictCounts = {
  likely_meets: number
  likely_fails: number
  ask_your_doctor: number
  not_checked: number
}
