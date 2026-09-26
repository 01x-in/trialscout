import type { Profile } from '@trialscout/contract'
import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import type { Criterion } from '../src/criteria.ts'
import { type AnswerCache, kvAnswerCache, memoryAnswerCache } from '../src/judge/cache.ts'
import { type JudgeTrial, Judge, parseJevResponse } from '../src/judge/judge.ts'
import { JudgeError } from '../src/problems.ts'
import { FakeJev, rules, when } from './jev.ts'

const PROFILE: Profile = {
  cancerType: 'non-small cell lung cancer',
  stage: 'IV',
  age: 58,
  sex: 'female',
  country: 'India',
  city: 'Pune',
  maxDistanceKm: 200,
  notes: 'EGFR exon 19 deletion. Took osimertinib.',
}
const BUDGET = { maxQuestions: 300, maxRequests: 30 }

function criterion(kind: Criterion['kind'], text: string): Criterion {
  return { kind, text, group: null }
}

function trial(nctId: string, criteria: Criterion[]): JudgeTrial {
  return { nctId, title: `Trial ${nctId}`, conditions: ['NSCLC'], criteria }
}

const STANDARD = [
  criterion('inclusion', 'Stage IV NSCLC'),
  criterion('inclusion', 'ECOG 0-1'),
  criterion('exclusion', 'Known EGFR sensitising mutation'),
  criterion('exclusion', 'Pregnant'),
]

function judge(jev: FakeJev | null, cache: AnswerCache = memoryAnswerCache()): Judge {
  return new Judge(jev, 'jev-1.13.0', cache)
}

describe('Judge.judgeSearch', () => {
  it('judges every criterion and maps the answers to verdicts', async () => {
    const jev = new FakeJev(
      rules(
        when('"Stage IV NSCLC"', 'meets'),
        when('"Pregnant"', 'does_not_apply'),
        when('"Known EGFR', 'does_not_apply', 0.5),
      ),
    )
    const report = await judge(jev).judgeSearch(PROFILE, [trial('NCT00000001', STANDARD)], BUDGET)

    expect(report.trials.get('NCT00000001')?.map((v) => [v.text, v.verdict])).toEqual([
      ['Stage IV NSCLC', 'likely_meets'],
      ['ECOG 0-1', 'ask_your_doctor'],
      ['Known EGFR sensitising mutation', 'ask_your_doctor'],
      ['Pregnant', 'likely_meets'],
    ])
    expect(report.model).toBe('jev-1.13.0')
  })

  it('judges exclusions first, and after a confident fail leaves inclusions not checked', async () => {
    const jev = new FakeJev(when('"Known EGFR', 'applies', 0.97))
    const report = await judge(jev).judgeSearch(PROFILE, [trial('NCT00000001', STANDARD)], BUDGET)

    const verdicts = report.trials.get('NCT00000001') ?? []
    expect(verdicts.filter((v) => v.kind === 'inclusion').map((v) => v.verdict)).toEqual([
      'not_checked',
      'not_checked',
    ])
    expect(verdicts.find((v) => v.text.startsWith('Known EGFR'))?.verdict).toBe('likely_fails')
    expect(jev.requests).toHaveLength(1)
    expect(
      Object.values(jev.requests[0]?.questions ?? {}).every((q) =>
        String(q.instructions).includes('turns away'),
      ),
    ).toBe(true)
  })

  it('does not stop early on an unconfident exclusion answer', async () => {
    const jev = new FakeJev(when('"Known EGFR', 'applies', 0.7))
    await judge(jev).judgeSearch(PROFILE, [trial('NCT00000001', STANDARD)], BUDGET)

    expect(jev.requests).toHaveLength(2)
  })

  it('stops asking when the question budget runs out, leaving the rest not checked', async () => {
    const jev = new FakeJev()
    const trials = ['NCT00000001', 'NCT00000002', 'NCT00000003'].map((id) => trial(id, STANDARD))
    // Exclusions come first across all trials: two trials' exclusions (4 questions) fit in 5,
    // the third trial's do not, and nothing is left for inclusions.
    const report = await judge(jev).judgeSearch(PROFILE, trials, {
      maxQuestions: 5,
      maxRequests: 30,
    })

    expect(jev.questionsAsked).toBe(4)
    expect(report.questionsAsked).toBe(jev.questionsAsked)
    expect(report.trials.get('NCT00000003')?.every((v) => v.verdict === 'not_checked')).toBe(true)
    for (const verdicts of report.trials.values()) {
      expect(
        verdicts.filter((v) => v.kind === 'inclusion').every((v) => v.verdict === 'not_checked'),
      ).toBe(true)
    }
  })

  it('stops asking when the request budget runs out', async () => {
    const jev = new FakeJev()
    const trials = ['NCT00000001', 'NCT00000002', 'NCT00000003'].map((id) => trial(id, STANDARD))
    const report = await judge(jev).judgeSearch(PROFILE, trials, {
      maxQuestions: 300,
      maxRequests: 2,
    })

    expect(jev.requests.length).toBeLessThanOrEqual(2)
    expect(report.requests).toBe(jev.requests.length)
  })

  it('splits a very large trial into several requests by whole questions', async () => {
    const long = Array.from({ length: 60 }, (_, i) =>
      criterion('exclusion', `Condition ${i}: ${'detail '.repeat(500)}`),
    )
    const jev = new FakeJev()
    await judge(jev).judgeSearch(PROFILE, [trial('NCT00000001', long)], BUDGET)

    expect(jev.requests.length).toBeGreaterThan(1)
    expect(jev.questionsAsked).toBe(60)
  })

  it('reuses cached answers for the same profile and trial', async () => {
    const cache = memoryAnswerCache()
    const first = new FakeJev(when('"Pregnant"', 'does_not_apply'))
    const again = new FakeJev()
    const once = await judge(first, cache).judgeSearch(
      PROFILE,
      [trial('NCT00000001', STANDARD)],
      BUDGET,
    )
    const twice = await judge(again, cache).judgeSearch(
      { ...PROFILE, city: 'Mumbai', maxDistanceKm: 50 },
      [trial('NCT00000001', STANDARD)],
      BUDGET,
    )

    expect(again.requests).toHaveLength(0)
    expect(twice.trials).toEqual(once.trials)
    expect(twice.cacheHits).toBe(2)
    expect(twice.questionsAsked).toBe(0)
  })

  it('asks again when anything Jev reads changes', async () => {
    const cache = memoryAnswerCache()
    await judge(new FakeJev(), cache).judgeSearch(PROFILE, [trial('NCT00000001', STANDARD)], BUDGET)
    const again = new FakeJev()
    await judge(again, cache).judgeSearch(
      { ...PROFILE, age: 59 },
      [trial('NCT00000001', STANDARD)],
      BUDGET,
    )

    expect(again.requests).toHaveLength(2)
  })

  it('keeps no profile content in KV', async () => {
    const cache = kvAnswerCache(env.CACHE)
    await judge(new FakeJev(), cache).judgeSearch(PROFILE, [trial('NCT00000001', STANDARD)], BUDGET)

    const { keys } = await env.CACHE.list()
    expect(keys.length).toBeGreaterThan(0)
    for (const { name } of keys) {
      expect(name).toMatch(/^jev:[0-9a-f]{64}$/)
      const value = (await env.CACHE.get(name)) ?? ''
      expect(value).not.toMatch(/osimertinib|EGFR exon|Pune|non-small/i)
    }
  })

  it('serves cached answers without an API key, but refuses to ask Jev without one', async () => {
    const cache = memoryAnswerCache()
    await judge(new FakeJev(), cache).judgeSearch(PROFILE, [trial('NCT00000001', STANDARD)], BUDGET)

    await expect(
      judge(null, cache).judgeSearch(PROFILE, [trial('NCT00000001', STANDARD)], BUDGET),
    ).resolves.toBeDefined()
    await expect(
      judge(null, cache).judgeSearch(PROFILE, [trial('NCT00000002', STANDARD)], BUDGET),
    ).rejects.toThrow(JudgeError)
  })

  it('turns a failed Jev request into a JudgeError', async () => {
    const failing = new FakeJev()
    failing.ask = async () => {
      throw new Error('429 Too Many Requests')
    }

    await expect(
      judge(failing).judgeSearch(PROFILE, [trial('NCT00000001', STANDARD)], BUDGET),
    ).rejects.toThrow(JudgeError)
  })
})

describe('Judge.judgeTrial', () => {
  it('judges every criterion, even after a confident fail', async () => {
    const jev = new FakeJev(rules(when('"Known EGFR', 'applies', 0.97), when('"ECOG', 'meets')))
    const report = await judge(jev).judgeTrial(PROFILE, trial('NCT00000001', STANDARD), BUDGET)

    expect(report.trials.get('NCT00000001')?.map((v) => [v.text, v.verdict])).toEqual([
      ['Stage IV NSCLC', 'ask_your_doctor'],
      ['ECOG 0-1', 'likely_meets'],
      ['Known EGFR sensitising mutation', 'likely_fails'],
      ['Pregnant', 'ask_your_doctor'],
    ])
    expect(jev.requests).toHaveLength(2)
  })

  it("asks only what the search left not checked, reusing the search's answers", async () => {
    const cache = memoryAnswerCache()
    const rule = when('"Known EGFR', 'applies', 0.97)
    await judge(new FakeJev(rule), cache).judgeSearch(
      PROFILE,
      [trial('NCT00000001', STANDARD)],
      BUDGET,
    )
    const opened = new FakeJev(rule)
    const report = await judge(opened, cache).judgeTrial(
      PROFILE,
      trial('NCT00000001', STANDARD),
      BUDGET,
    )

    expect(opened.questionsAsked).toBe(2)
    expect(
      Object.values(opened.requests[0]?.questions ?? {}).every((q) =>
        String(q.instructions).includes('requires this'),
      ),
    ).toBe(true)
    expect(report.cacheHits).toBe(1)
    expect(report.trials.get('NCT00000001')?.some((v) => v.verdict === 'not_checked')).toBe(false)
  })

  it('leaves criteria beyond the budget not checked', async () => {
    const jev = new FakeJev()
    const report = await judge(jev).judgeTrial(PROFILE, trial('NCT00000001', STANDARD), {
      maxQuestions: 2,
      maxRequests: 5,
    })

    expect(report.trials.get('NCT00000001')?.map((v) => v.verdict)).toEqual([
      'not_checked',
      'not_checked',
      'ask_your_doctor',
      'ask_your_doctor',
    ])
  })
})

describe('parseJevResponse (Typia)', () => {
  it('reads a recorded jev-1.13.0 response', async () => {
    const recorded = (await import('../../../fixtures/jev/NCT06563999-rich-cohort.json')).default
    const parsed = parseJevResponse(recorded.response)

    expect(parsed.model).toBe('jev-1.13.0')
    expect(Object.keys(parsed.answers)).toHaveLength(24)
  })

  it('rejects a malformed response', () => {
    expect(() => parseJevResponse({ model: 'jev', answers: { a: { choice: 1 } } })).toThrow(
      JudgeError,
    )
  })
})
