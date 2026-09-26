import type { JevClient, JevRequest, JevState } from '../src/judge/jev.ts'

// A fake Jev: answers every Choice question by a rule over its instructions, and records
// each request. No network.

export type FakeAnswer = { choice: string; confidence: number }
export type Rule = (
  instructions: string,
  options: string[],
  state: JevState,
) => FakeAnswer | undefined

// With no matching rule, Jev says the profile does not say enough.
const UNKNOWN: FakeAnswer = { choice: 'not_enough_information', confidence: 0.9 }

export class FakeJev implements JevClient {
  readonly requests: JevRequest[] = []
  readonly #rule: Rule
  readonly #model: string

  constructor(rule: Rule = () => undefined, model = 'jev-1.13.0') {
    this.#rule = rule
    this.#model = model
  }

  get questionsAsked(): number {
    return this.requests.reduce((n, r) => n + Object.keys(r.questions).length, 0)
  }

  async ask(request: JevRequest): Promise<unknown> {
    this.requests.push(request)
    const answers: Record<string, unknown> = {}
    for (const [id, question] of Object.entries(request.questions)) {
      const options = Object.keys(question.criteria)
      const answer = this.#rule(String(question.instructions), options, request.state) ?? UNKNOWN
      const rest = (1 - answer.confidence) / Math.max(1, options.length - 1)
      answers[id] = {
        type: 'choice',
        choice: answer.choice,
        confidence: answer.confidence,
        probabilities: Object.fromEntries(
          options.map((o) => [o, o === answer.choice ? answer.confidence : rest]),
        ),
      }
    }
    return { model: this.#model, answers, usage: { input_tokens: 100, output_tokens: 10 } }
  }
}

/** Answers `choice` with `confidence` for questions whose instructions contain `text`. */
export function when(text: string, choice: string, confidence = 0.95): Rule {
  return (instructions) => (instructions.includes(text) ? { choice, confidence } : undefined)
}

export function rules(...all: Rule[]): Rule {
  return (instructions, options, state) => {
    for (const rule of all) {
      const answer = rule(instructions, options, state)
      if (answer !== undefined) return answer
    }
    return undefined
  }
}
