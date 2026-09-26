import type { Profile } from '@trialscout/contract'
import { describe, expect, it } from 'vitest'
import { jevQuestion, jevState, profileKey } from '../src/judge/questions.ts'

const PROFILE: Profile = {
  cancerType: 'Non-small cell lung cancer',
  stage: 'IV',
  age: 58,
  sex: 'female',
  country: 'India',
  city: 'Pune',
  maxDistanceKm: 200,
  notes: 'EGFR exon 19 deletion.',
}
const TRIAL = { title: 'A lung cancer trial', conditions: ['NSCLC'] }

describe('jevState', () => {
  it('holds the patient and the trial, and nothing about where the patient lives', () => {
    const state = jevState(PROFILE, TRIAL)

    expect(state).toEqual({
      patient: {
        cancer: 'Non-small cell lung cancer',
        stage: 'Stage IV',
        age: 58,
        sex: 'female',
        notes: 'EGFR exon 19 deletion.',
      },
      trial: { title: 'A lung cancer trial', conditions: ['NSCLC'] },
    })
    expect(JSON.stringify(state)).not.toMatch(/Pune|India|200/)
  })

  it('says an unknown stage is not known and leaves out empty notes', () => {
    const { notes: _notes, ...withoutNotes } = PROFILE
    const state = jevState({ ...withoutNotes, stage: 'unknown' }, TRIAL)

    expect(state.patient).toEqual({
      cancer: 'Non-small cell lung cancer',
      stage: 'not known',
      age: 58,
      sex: 'female',
    })
  })
})

describe('jevQuestion', () => {
  it('asks whether an inclusion requirement is met, with a not-applicable option', () => {
    const question = jevQuestion({ kind: 'inclusion', text: 'Age 18 or over', group: null })

    expect(question.type).toBe('choice')
    expect(question.instructions).toBe(
      'A clinical trial requires this of every participant: "Age 18 or over". Going only by what `patient` says, does this patient meet the requirement?',
    )
    expect(Object.keys(question.criteria)).toEqual([
      'meets',
      'does_not_meet',
      'not_enough_information',
      'not_applicable',
    ])
  })

  it('asks positively whether an exclusion describes the patient', () => {
    const question = jevQuestion({ kind: 'exclusion', text: 'Pregnant', group: null })

    expect(question.instructions).toBe(
      'A clinical trial turns away anyone this describes: "Pregnant". Going only by what `patient` says, does it describe this patient?',
    )
    expect(Object.keys(question.criteria)).toEqual([
      'applies',
      'does_not_apply',
      'not_enough_information',
      'not_applicable',
    ])
  })

  it('names the group a criterion belongs to', () => {
    const question = jevQuestion({ kind: 'inclusion', text: 'KRAS mutant', group: 'Cohort B' })

    expect(question.instructions).toContain('every participant in "Cohort B": "KRAS mutant"')
  })
})

describe('profileKey', () => {
  it('ignores where the patient lives and how far they travel', () => {
    expect(profileKey(PROFILE)).toBe(
      profileKey({ ...PROFILE, city: 'Mumbai', country: 'IN', maxDistanceKm: 50 }),
    )
  })

  it('ignores case and spacing in free text', () => {
    expect(profileKey(PROFILE)).toBe(
      profileKey({
        ...PROFILE,
        cancerType: '  non-small  CELL lung cancer ',
        notes: 'EGFR exon 19   deletion.',
      }),
    )
  })

  it('changes with anything Jev reads', () => {
    expect(profileKey(PROFILE)).not.toBe(profileKey({ ...PROFILE, age: 59 }))
    expect(profileKey(PROFILE)).not.toBe(profileKey({ ...PROFILE, notes: 'No EGFR mutation.' }))
  })
})
