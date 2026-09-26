import { PROBLEM_TYPES, type Profile, type TrialVerdictsResponse } from '@trialscout/contract'
import { countVerdicts, UNSPLITTABLE_COUNTS } from './judge/verdict.ts'
import { ProblemError } from './problems.ts'
import type { Services } from './services.ts'
import { studyUrl, type Trial } from './trial.ts'

// One opened trial: every criterion with its verdict, judging on demand whatever the search
// left "not checked yet". The trial comes from D1 when a search saved it, or else from
// ClinicalTrials.gov. The profile is used here and discarded; nothing about it is stored.

async function findTrial(
  services: Services,
  nctId: string,
): Promise<{ trial: Trial; fetchedAt: number }> {
  const saved = await services.store.find(nctId)
  if (saved !== null) return saved
  const trial = await services.ctgov.study(nctId)
  if (trial === null) {
    throw new ProblemError(
      404,
      'We could not find that trial on ClinicalTrials.gov.',
      {},
      PROBLEM_TYPES.trialNotFound,
    )
  }
  await services.store.save([trial])
  return { trial, fetchedAt: services.now() }
}

export async function trialVerdicts(
  services: Services,
  nctId: string,
  profile: Profile,
  // Runs just before the first Jev request, so only checks that reach Jev are rate limited.
  beforeJev?: () => Promise<void>,
): Promise<TrialVerdictsResponse> {
  const { trial, fetchedAt } = await findTrial(services, nctId)
  const about = {
    nctId: trial.nctId,
    title: trial.title,
    phases: trial.phases,
    sponsor: trial.sponsor,
    url: studyUrl(trial.nctId),
    dataAsOf: fetchedAt,
  }
  const split = (await services.store.criteriaFor([trial])).get(trial.nctId)
  if (split === undefined || !split.ok) {
    return {
      ...about,
      eligibility: 'unsplittable',
      criteria: [],
      rawCriteria: trial.eligibility.criteria,
      counts: UNSPLITTABLE_COUNTS,
      checked: { questions: 0, requests: 0, cacheHits: 0, model: null },
    }
  }

  const report = await services.judge.judgeTrial(
    profile,
    {
      nctId: trial.nctId,
      title: trial.title,
      conditions: trial.conditions,
      criteria: split.criteria,
    },
    services.settings.trialBudget,
    beforeJev,
  )
  const criteria = report.trials.get(trial.nctId) ?? []
  return {
    ...about,
    eligibility: 'split',
    criteria,
    rawCriteria: null,
    counts: countVerdicts(criteria.map((c) => c.verdict)),
    checked: {
      questions: report.questionsAsked,
      requests: report.requests,
      cacheHits: report.cacheHits,
      model: report.model,
    },
  }
}
