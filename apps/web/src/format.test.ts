import type { Profile } from '@trialscout/contract'
import { describe, expect, it } from 'vitest'
import { countParts, phaseLabel, profileSummary } from './format.ts'

describe('phaseLabel', () => {
  it.each([
    [['PHASE2'], 'Phase 2'],
    [['PHASE1', 'PHASE2'], 'Phase 1/2'],
    [['EARLY_PHASE1'], 'Early phase 1'],
    [['PHASE3', 'PHASE2'], 'Phase 2/3'],
    [['NA'], null],
    [[], null],
  ])('%j -> %j', (phases, label) => {
    expect(phaseLabel(phases)).toBe(label)
  })
})

describe('countParts', () => {
  it('lists each verdict with its number, leaving out zeros', () => {
    expect(
      countParts({ likely_meets: 9, likely_fails: 1, ask_your_doctor: 4, not_checked: 0 }),
    ).toEqual([
      { verdict: 'likely_meets', count: 9, label: '9 likely meets' },
      { verdict: 'likely_fails', count: 1, label: '1 likely fails' },
      { verdict: 'ask_your_doctor', count: 4, label: '4 ask your doctor' },
    ])
  })

  it('names criteria not checked yet', () => {
    expect(
      countParts({ likely_meets: 0, likely_fails: 0, ask_your_doctor: 0, not_checked: 3 }),
    ).toEqual([{ verdict: 'not_checked', count: 3, label: '3 not checked yet' }])
  })
})

describe('profileSummary', () => {
  const profile: Profile = {
    cancerType: 'lung cancer',
    stage: 'IV',
    age: 58,
    sex: 'female',
    country: 'India',
    city: 'Pune',
    maxDistanceKm: 300,
  }

  it.each([
    ['female', 'lung cancer, stage IV, age 58, female.'],
    ['male', 'lung cancer, stage IV, age 58, male.'],
    ['other', 'lung cancer, stage IV, age 58, sex other.'],
  ] as const)('sums up a %s patient', (sex, expected) => {
    expect(profileSummary({ ...profile, sex })).toBe(expected)
  })
})
