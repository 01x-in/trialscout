import {
  PROBLEM_TYPES,
  type Profile,
  type SearchResponse,
  type TrialVerdictsResponse,
} from '@trialscout/contract'
import { hc } from 'hono/client'
import typia from 'typia'
import type { AppType } from '../../worker/src/app.ts'

// The API, through Hono's typed RPC client. Relative to this origin: the web Worker hands
// /api/* to the API Worker, and Vite proxies it in development. The profile is only ever
// sent in a request body, never in a URL.

export type RateLimited = { kind: 'rate_limited'; retryAfterSeconds: number | null }

export type SearchOutcome =
  | { kind: 'results'; response: SearchResponse }
  | { kind: 'unknown_place'; field: 'city' | 'country'; message: string }
  | RateLimited
  | { kind: 'unavailable' }

export type TrialOutcome =
  | { kind: 'verdicts'; response: TrialVerdictsResponse }
  | { kind: 'not_found' }
  | RateLimited
  | { kind: 'unavailable' }

export type CheckTrial = (nctId: string, profile: Profile) => Promise<TrialOutcome>

type Problem = { type: string; status: number; detail: string }
const isProblem = typia.createIs<Problem>()

function client(fetchImpl: typeof fetch): ReturnType<typeof hc<AppType>> {
  return hc<AppType>(globalThis.location.origin, { fetch: fetchImpl })
}

/** The Problem Details body of a failed response, or null when it has none. */
async function problemOf(response: Response): Promise<Problem | null> {
  try {
    const body: unknown = await response.json()
    return isProblem(body) ? body : null
  } catch {
    return null
  }
}

function rateLimited(response: Response): RateLimited | null {
  if (response.status !== 429) return null
  const seconds = Number(response.headers.get('Retry-After'))
  return {
    kind: 'rate_limited',
    retryAfterSeconds: Number.isFinite(seconds) && seconds > 0 ? seconds : null,
  }
}

export async function searchTrials(
  profile: Profile,
  fetchImpl: typeof fetch = fetch,
): Promise<SearchOutcome> {
  let response: Response
  try {
    response = await client(fetchImpl).api.search.$post({ json: profile })
  } catch {
    return { kind: 'unavailable' }
  }
  if (response.ok) return { kind: 'results', response: (await response.json()) as SearchResponse }

  const problem = await problemOf(response)
  if (problem?.type === PROBLEM_TYPES.unknownCity) {
    return { kind: 'unknown_place', field: 'city', message: problem.detail }
  }
  if (problem?.type === PROBLEM_TYPES.unknownCountry) {
    return { kind: 'unknown_place', field: 'country', message: problem.detail }
  }
  return rateLimited(response) ?? { kind: 'unavailable' }
}

/** Every rule of one trial, judged against the profile. */
export async function checkTrial(
  nctId: string,
  profile: Profile,
  fetchImpl: typeof fetch = fetch,
): Promise<TrialOutcome> {
  let response: Response
  try {
    response = await client(fetchImpl).api.trials[':nctId'].verdicts.$post({
      param: { nctId },
      json: profile,
    })
  } catch {
    return { kind: 'unavailable' }
  }
  if (response.ok) {
    return { kind: 'verdicts', response: (await response.json()) as TrialVerdictsResponse }
  }
  const problem = await problemOf(response)
  if (problem?.type === PROBLEM_TYPES.trialNotFound) return { kind: 'not_found' }
  return rateLimited(response) ?? { kind: 'unavailable' }
}
