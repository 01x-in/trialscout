import type { CriterionVerdict, Profile } from '@trialscout/contract'
import typia, { type tags } from 'typia'
import type { Criterion } from '../criteria.ts'
import { failedPaths } from '../http.ts'
import { JudgeError } from '../problems.ts'
import { type AnswerCache, answerKey } from './cache.ts'
import type { JevClient, JevRequest } from './jev.ts'
import { jevQuestion, jevState, profileKey, QUESTION_VERSION } from './questions.ts'
import { type Answer, toVerdict } from './verdict.ts'

// Judges a search's trials with Jev, within a budget:
//   1. Every trial's exclusion criteria, nearest trial first, one request per trial.
//   2. The inclusion criteria of trials with no confident exclusion fail.
// Whatever the budget does not reach, and the inclusions of a trial that already has a
// confident fail, are "not checked yet"; the trial page judges them when opened (M2.1).
// Cached answers cost nothing and are always used.

export type JudgeTrial = {
  nctId: string
  title: string
  conditions: string[]
  criteria: Criterion[]
}

export type Budget = { maxQuestions: number; maxRequests: number }

export type JudgeReport = {
  trials: Map<string, CriterionVerdict[]>
  questionsAsked: number
  requests: number
  cacheHits: number
  // The model Jev reported, or null when every answer came from the cache.
  model: string | null
}

// Well under Jev's 64k-token request limit (about 4 characters a token).
const MAX_REQUEST_CHARS = 150_000
// Requests in flight at once.
const CONCURRENCY = 6

type ChoiceAnswer = {
  type: 'choice'
  choice: string
  confidence: number & tags.Minimum<0> & tags.Maximum<1>
  probabilities: Record<string, number>
}

type JevResponse = {
  model: string
  answers: Record<string, ChoiceAnswer>
  usage?: { input_tokens: number; output_tokens: number }
}

const validateResponse = typia.createValidate<JevResponse>()

export function parseJevResponse(raw: unknown): JevResponse {
  const result = validateResponse(raw)
  if (!result.success) {
    throw new JudgeError(`Jev returned a malformed response at ${failedPaths(result.errors)}.`)
  }
  return result.data
}

// One trial's criteria of one kind, asked together.
type Part = { trial: JudgeTrial; positions: number[]; key: string }

function chunk(questions: JevRequest['questions']): JevRequest['questions'][] {
  const chunks: JevRequest['questions'][] = []
  let current: JevRequest['questions'] = {}
  let size = 0
  for (const [id, question] of Object.entries(questions)) {
    const length = JSON.stringify(question).length
    if (size > 0 && size + length > MAX_REQUEST_CHARS) {
      chunks.push(current)
      current = {}
      size = 0
    }
    current[id] = question
    size += length
  }
  if (size > 0) chunks.push(current)
  return chunks
}

function requestsFor(part: Part): number {
  return chunk(questionsFor(part)).length
}

function questionsFor(part: Part): JevRequest['questions'] {
  const questions: JevRequest['questions'] = {}
  for (const p of part.positions) {
    const criterion = part.trial.criteria[p]
    if (criterion !== undefined) questions[`c${p}`] = jevQuestion(criterion)
  }
  return questions
}

async function pool<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length)
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < tasks.length) {
      const index = next++
      const task = tasks[index]
      if (task !== undefined) results[index] = await task()
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker))
  return results
}

export class Judge {
  readonly #jev: JevClient | null
  readonly #model: string
  readonly #cache: AnswerCache

  constructor(jev: JevClient | null, model: string, cache: AnswerCache) {
    this.#jev = jev
    this.#model = model
    this.#cache = cache
  }

  async judgeSearch(profile: Profile, trials: JudgeTrial[], budget: Budget): Promise<JudgeReport> {
    const answers = new Map<string, (Answer | null)[]>()
    for (const trial of trials)
      answers.set(
        trial.nctId,
        trial.criteria.map(() => null),
      )
    const asked = new Set<string>() // nctId:position judged (from Jev or cache)
    const report: Omit<JudgeReport, 'trials'> = {
      questionsAsked: 0,
      requests: 0,
      cacheHits: 0,
      model: null,
    }
    const who = profileKey(profile)

    const partOf = async (trial: JudgeTrial, kind: Criterion['kind']): Promise<Part | null> => {
      const positions = trial.criteria.flatMap((c, i) => (c.kind === kind ? [i] : []))
      if (positions.length === 0) return null
      const key = await answerKey([
        this.#model,
        QUESTION_VERSION,
        { title: trial.title, conditions: trial.conditions },
        positions.map((p) => trial.criteria[p]),
        who,
      ])
      return { trial, positions, key }
    }

    const runPhase = async (parts: Part[]): Promise<void> => {
      const toAsk: Part[] = []
      for (const part of parts) {
        const cached = await this.#cache.get(part.key)
        if (cached !== null && cached.answers.length === part.positions.length) {
          this.#record(answers, asked, part, cached.answers)
          report.cacheHits += 1
          continue
        }
        const requests = requestsFor(part)
        const fits =
          report.questionsAsked + part.positions.length <= budget.maxQuestions &&
          report.requests + requests <= budget.maxRequests
        if (!fits) continue // Left not checked.
        report.questionsAsked += part.positions.length
        report.requests += requests
        toAsk.push(part)
      }
      if (toAsk.length === 0) return
      const jev = this.#jev
      if (jev === null) throw new JudgeError('TYPESAFE_API_KEY is not configured.')
      await pool(
        toAsk.map((part) => async () => {
          const { model, answers: got } = await this.#ask(jev, profile, part)
          report.model = model
          this.#record(answers, asked, part, got)
          await this.#cache.put(part.key, { model, answers: got })
        }),
        CONCURRENCY,
      )
    }

    const exclusions = (await Promise.all(trials.map((t) => partOf(t, 'exclusion')))).filter(
      (p): p is Part => p !== null,
    )
    await runPhase(exclusions)

    const failed = (trial: JudgeTrial): boolean =>
      trial.criteria.some(
        (c, i) =>
          c.kind === 'exclusion' &&
          toVerdict('exclusion', answers.get(trial.nctId)?.[i] ?? null) === 'likely_fails',
      )
    const inclusions = (
      await Promise.all(trials.filter((t) => !failed(t)).map((t) => partOf(t, 'inclusion')))
    ).filter((p): p is Part => p !== null)
    await runPhase(inclusions)

    const verdicts = new Map<string, CriterionVerdict[]>()
    for (const trial of trials) {
      const got = answers.get(trial.nctId) ?? []
      verdicts.set(
        trial.nctId,
        trial.criteria.map((c, i) => {
          const answer = got[i] ?? null
          const judged = asked.has(`${trial.nctId}:${i}`)
          return {
            kind: c.kind,
            text: c.text,
            group: c.group,
            verdict: judged ? toVerdict(c.kind, answer) : 'not_checked',
            confidence: judged ? (answer?.confidence ?? null) : null,
          }
        }),
      )
    }
    return { trials: verdicts, ...report }
  }

  #record(
    answers: Map<string, (Answer | null)[]>,
    asked: Set<string>,
    part: Part,
    got: Answer[],
  ): void {
    const row = answers.get(part.trial.nctId)
    part.positions.forEach((position, n) => {
      if (row !== undefined) row[position] = got[n] ?? null
      asked.add(`${part.trial.nctId}:${position}`)
    })
  }

  async #ask(
    jev: JevClient,
    profile: Profile,
    part: Part,
  ): Promise<{ model: string; answers: Answer[] }> {
    const state = jevState(profile, part.trial)
    const byId = new Map<string, Answer>()
    let model = this.#model
    for (const questions of chunk(questionsFor(part))) {
      let raw: unknown
      try {
        raw = await jev.ask({ state, questions, model: this.#model })
      } catch (cause) {
        throw new JudgeError('The Jev request failed.', { cause })
      }
      const response = parseJevResponse(raw)
      model = response.model
      for (const [id, question] of Object.entries(questions)) {
        const answer = response.answers[id]
        // An answer outside the question's options is treated as no answer.
        if (answer !== undefined && answer.choice in question.criteria) {
          byId.set(id, { choice: answer.choice, confidence: answer.confidence })
        }
      }
    }
    // A missing answer is stored as not_enough_information, which maps to ask your doctor.
    const none: Answer = { choice: 'not_enough_information', confidence: 0 }
    return { model, answers: part.positions.map((p) => byId.get(`c${p}`) ?? none) }
  }
}
