import type { JudgeWork } from './search.ts'
import type { CriterionVerdict, VerdictCounts } from './verdict.ts'

// POST /api/trials/:nctId/verdicts: the body is the Profile (never the URL, so it stays out
// of logs); this is the answer. Criteria the search left "not checked yet" are judged here.

export type TrialVerdictsResponse = {
  nctId: string
  title: string
  phases: string[]
  sponsor: string | null
  // The official ClinicalTrials.gov page.
  url: string
  eligibility: 'split' | 'unsplittable'
  // Every criterion in source order, each with the verbatim text it was judged against.
  // Empty when the eligibility section could not be split.
  criteria: CriterionVerdict[]
  // The verbatim eligibility section, sent only when it could not be split.
  rawCriteria: string | null
  counts: VerdictCounts
  checked: JudgeWork
  // Epoch milliseconds the trial data was fetched from ClinicalTrials.gov.
  dataAsOf: number
}
