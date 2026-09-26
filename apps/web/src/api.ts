import { PROBLEM_TYPES, type Profile, type SearchResponse } from '@trialscout/contract'
import { hc } from 'hono/client'
import typia from 'typia'
import type { AppType } from '../../worker/src/app.ts'

// The API, through Hono's typed RPC client. Relative to this origin: the web Worker hands
// /api/* to the API Worker, and Vite proxies it in development.

export type SearchOutcome =
  | { kind: 'results'; response: SearchResponse }
  | { kind: 'unknown_place'; field: 'city' | 'country'; message: string }
  | { kind: 'rate_limited'; retryAfterSeconds: number | null }
  | { kind: 'unavailable' }

type Problem = { type: string; status: number; detail: string }
const isProblem = typia.createIs<Problem>()

export async function searchTrials(
  profile: Profile,
  fetchImpl: typeof fetch = fetch,
): Promise<SearchOutcome> {
  const client = hc<AppType>(globalThis.location.origin, { fetch: fetchImpl })
  let response: Response
  try {
    response = await client.api.search.$post({ json: profile })
  } catch {
    return { kind: 'unavailable' }
  }
  if (response.ok) return { kind: 'results', response: (await response.json()) as SearchResponse }

  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    // Not a Problem Details body; treated as unavailable below.
  }
  if (isProblem(body)) {
    if (body.type === PROBLEM_TYPES.unknownCity) {
      return { kind: 'unknown_place', field: 'city', message: body.detail }
    }
    if (body.type === PROBLEM_TYPES.unknownCountry) {
      return { kind: 'unknown_place', field: 'country', message: body.detail }
    }
  }
  if (response.status === 429) {
    const seconds = Number(response.headers.get('Retry-After'))
    return {
      kind: 'rate_limited',
      retryAfterSeconds: Number.isFinite(seconds) && seconds > 0 ? seconds : null,
    }
  }
  return { kind: 'unavailable' }
}
