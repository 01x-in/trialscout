import type { ChoiceQuestion } from '@typesafe-ai/sdk'
import { choice } from '@typesafe-ai/sdk'
import type { Profile } from '@trialscout/contract'
import type { Criterion } from '../criteria.ts'
import type { JevState } from './jev.ts'

// The Jev state and questions, worded as validated in the M1.3 spike (docs/jev-budget.md).
// Bump QUESTION_VERSION whenever the wording or options change: it is part of the cache key.
export const QUESTION_VERSION = 'q1'

export type TrialContext = { title: string; conditions: string[] }

// Only what the criteria are about. City, country and travel distance are never sent to Jev.
export function jevState(profile: Profile, trial: TrialContext): JevState {
  const notes = profile.notes?.trim()
  return {
    patient: {
      cancer: profile.cancerType,
      stage: profile.stage === 'unknown' ? 'not known' : `Stage ${profile.stage}`,
      age: profile.age,
      sex: profile.sex,
      ...(notes ? { notes } : {}),
    },
    trial: { title: trial.title, conditions: trial.conditions },
  }
}

const UNKNOWN = 'The patient information does not say enough to tell either way.'
const NOT_APPLICABLE =
  'The requirement only covers a different group of patients, such as another cancer type or the other sex, so it does not apply to this patient.'

export function jevQuestion(criterion: Criterion): ChoiceQuestion {
  const where = criterion.group === null ? '' : ` in "${criterion.group}"`
  if (criterion.kind === 'inclusion') {
    return choice(
      `A clinical trial requires this of every participant${where}: "${criterion.text}". Going only by what \`patient\` says, does this patient meet the requirement?`,
      {
        meets: 'The patient information shows the patient meets this requirement.',
        does_not_meet: 'The patient information shows the patient does not meet this requirement.',
        not_enough_information: UNKNOWN,
        not_applicable: NOT_APPLICABLE,
      },
    )
  }
  return choice(
    `A clinical trial turns away anyone this describes${criterion.group === null ? '' : `, among participants in "${criterion.group}"`}: "${criterion.text}". Going only by what \`patient\` says, does it describe this patient?`,
    {
      applies: 'The patient information shows this describes the patient.',
      does_not_apply: 'The patient information shows this does not describe the patient.',
      not_enough_information: UNKNOWN,
      not_applicable: NOT_APPLICABLE,
    },
  )
}

function tidy(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase()
}

/** The profile as the cache sees it: only what Jev reads, normalised. */
export function profileKey(profile: Profile): string {
  return JSON.stringify([
    tidy(profile.cancerType),
    profile.stage,
    profile.age,
    profile.sex,
    tidy(profile.notes ?? ''),
  ])
}
