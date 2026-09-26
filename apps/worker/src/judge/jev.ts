import type { ChoiceQuestion, JsonValue, TypeSafeClient } from '@typesafe-ai/sdk'

// The one call the judge makes to Jev, behind an interface so tests use a fake. The
// response is untyped here and validated with Typia by the judge.

export type JevState = { [key: string]: JsonValue }

export type JevRequest = {
  state: JevState
  questions: Record<string, ChoiceQuestion>
  model: string
}

export interface JevClient {
  ask(request: JevRequest): Promise<unknown>
}

/** The TypeSafe SDK as a JevClient; the SDK retries 429 and 5xx with backoff. */
export function sdkJev(client: TypeSafeClient): JevClient {
  return { ask: (request) => client.systemOne(request) }
}
