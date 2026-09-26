import { describe, expect, it } from 'vitest'
import { countVerdicts, THRESHOLDS, toVerdict } from '../src/judge/verdict.ts'

describe('toVerdict', () => {
  it.each([
    ['inclusion', 'meets', 0.95, 'likely_meets'],
    ['inclusion', 'meets', THRESHOLDS.meets, 'likely_meets'],
    ['inclusion', 'meets', 0.79, 'ask_your_doctor'],
    ['inclusion', 'does_not_meet', 0.95, 'likely_fails'],
    ['inclusion', 'does_not_meet', THRESHOLDS.fails, 'likely_fails'],
    ['inclusion', 'does_not_meet', 0.89, 'ask_your_doctor'],
    ['inclusion', 'not_enough_information', 1, 'ask_your_doctor'],
    ['inclusion', 'not_applicable', 0.9, 'not_applicable'],
    ['inclusion', 'not_applicable', 0.5, 'ask_your_doctor'],
    // Exclusions are phrased positively and inverted here.
    ['exclusion', 'applies', 0.95, 'likely_fails'],
    ['exclusion', 'applies', 0.8, 'ask_your_doctor'],
    ['exclusion', 'does_not_apply', 0.9, 'likely_meets'],
    ['exclusion', 'not_enough_information', 0.99, 'ask_your_doctor'],
    ['exclusion', 'not_applicable', 0.85, 'not_applicable'],
    // An option from the other kind, or an unknown one, is never guessed at.
    ['inclusion', 'applies', 0.99, 'ask_your_doctor'],
    ['exclusion', 'meets', 0.99, 'ask_your_doctor'],
    ['inclusion', 'maybe', 0.99, 'ask_your_doctor'],
  ] as const)('%s answered %s at %d is %s', (kind, choice, confidence, verdict) => {
    expect(toVerdict(kind, { choice, confidence })).toBe(verdict)
  })

  it('treats a missing answer as ask your doctor', () => {
    expect(toVerdict('inclusion', null)).toBe('ask_your_doctor')
  })
})

describe('countVerdicts', () => {
  it('counts the three verdicts and the criteria not checked yet, leaving out not applicable', () => {
    expect(
      countVerdicts([
        'likely_meets',
        'likely_meets',
        'likely_fails',
        'ask_your_doctor',
        'not_applicable',
        'not_checked',
      ]),
    ).toEqual({ likely_meets: 2, likely_fails: 1, ask_your_doctor: 1, not_checked: 1 })
  })
})
