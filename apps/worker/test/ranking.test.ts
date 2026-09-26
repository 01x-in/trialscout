import type { VerdictCounts } from '@trialscout/contract'
import { describe, expect, it } from 'vitest'
import { type Rankable, rankTrials } from '../src/ranking.ts'

function counts(meets: number, fails: number, ask: number, notChecked = 0): VerdictCounts {
  return { likely_meets: meets, likely_fails: fails, ask_your_doctor: ask, not_checked: notChecked }
}

function t(nctId: string, c: VerdictCounts, distanceKm: number | null = 10): Rankable {
  return { nctId, counts: c, distanceKm }
}

function order(trials: Rankable[]): string[] {
  return rankTrials(trials).map((r) => r.nctId)
}

describe('rankTrials', () => {
  it.each<[string, Rankable[], string[]]>([
    [
      'trials with no likely fails first, failing trials last but kept',
      [t('FAILS', counts(9, 1, 0)), t('CLEAN', counts(2, 0, 5))],
      ['CLEAN', 'FAILS'],
    ],
    [
      'fewer unknowns first, as a share of the trial',
      [t('HALF', counts(5, 0, 5)), t('TENTH', counts(9, 0, 1))],
      ['TENTH', 'HALF'],
    ],
    [
      'share, not count: 3 of 30 unknown beats 2 of 4',
      [t('SHORT', counts(2, 0, 2)), t('LONG', counts(27, 0, 3))],
      ['LONG', 'SHORT'],
    ],
    [
      'not checked yet counts as unknown, so an unjudged trial never tops the list',
      [t('UNJUDGED', counts(0, 0, 0, 12)), t('JUDGED', counts(6, 0, 6))],
      ['JUDGED', 'UNJUDGED'],
    ],
    [
      'nearer first when otherwise equal',
      [t('FAR', counts(8, 0, 2), 150), t('NEAR', counts(8, 0, 2), 12)],
      ['NEAR', 'FAR'],
    ],
    [
      'unknown distance after known distances',
      [t('UNKNOWN', counts(8, 0, 2), null), t('KNOWN', counts(8, 0, 2), 190)],
      ['KNOWN', 'UNKNOWN'],
    ],
    [
      'among failing trials, fewer fails first',
      [t('TWO', counts(8, 2, 0)), t('ONE', counts(8, 1, 5))],
      ['ONE', 'TWO'],
    ],
    [
      'the NCT ID settles an exact tie',
      [t('NCT00000002', counts(1, 0, 1)), t('NCT00000001', counts(1, 0, 1))],
      ['NCT00000001', 'NCT00000002'],
    ],
  ])('puts %s', (_label, trials, expected) => {
    expect(order(trials)).toEqual(expected)
  })

  it('never removes a trial', () => {
    const trials = [
      t('A', counts(0, 12, 0)),
      t('B', counts(0, 0, 0, 0), null),
      t('C', counts(3, 0, 1)),
    ]

    expect(order(trials).sort()).toEqual(['A', 'B', 'C'])
  })

  it('does not change its input', () => {
    const trials = [t('B', counts(1, 1, 0)), t('A', counts(1, 0, 0))]
    rankTrials(trials)

    expect(trials.map((x) => x.nctId)).toEqual(['B', 'A'])
  })
})
