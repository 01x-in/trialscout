import type { IValidation } from 'typia'
import { UpstreamError } from './problems.ts'

/** A fetch compatible with the global one; tests pass one that replays recordings. */
export type Fetch = (input: string, init?: RequestInit) => Promise<Response>

/** How a GET is retried when the upstream stalls, drops the connection or is overloaded. */
export type Retry = { attempts: number; timeoutMs: number; backoffMs: number }

export type Http = { baseUrl: string; fetch: Fetch; retry?: Retry }

// Short attempts, retried, rather than one long wait on a stalled connection.
export const UPSTREAM_RETRY: Retry = { attempts: 3, timeoutMs: 8_000, backoffMs: 250 }

const USER_AGENT = 'trialscout (+https://trialscout.cc)'

function retryable(status: number): boolean {
  return status === 408 || status === 429 || status >= 500
}

function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve()
}

export function url(http: Http, path: string, params: Record<string, string>): string {
  const query = new URLSearchParams(params)
  const suffix = query.size > 0 ? `?${query}` : ''
  return `${http.baseUrl.replace(/\/+$/, '')}${path}${suffix}`
}

/**
 * One GET, as a response. A timeout, a network failure, 408, 429 or 5xx is retried; if the
 * last attempt still fails, a network failure or timeout raises UpstreamError and a bad
 * status is returned for the caller to judge.
 */
export async function get(
  http: Http,
  path: string,
  params: Record<string, string>,
  what: string,
): Promise<Response> {
  const retry = http.retry ?? UPSTREAM_RETRY
  const target = url(http, path, params)
  for (let attempt = 1; ; attempt++) {
    const last = attempt >= retry.attempts
    try {
      const response = await http.fetch(target, {
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(retry.timeoutMs),
      })
      if (last || !retryable(response.status)) return response
      // Free the connection before trying again.
      await response.body?.cancel()
    } catch (cause) {
      if (last) {
        const reason = cause instanceof Error ? cause.message : String(cause)
        throw new UpstreamError(`${what}: ${reason} (after ${attempt} attempts)`, { cause })
      }
    }
    await sleep(retry.backoffMs * 2 ** (attempt - 1))
  }
}

/** Where a Typia validation failed, as `$input.path` list, for logs. */
export function failedPaths(errors: IValidation.IError[]): string {
  return [...new Set(errors.map((e) => e.path))].slice(0, 5).join(', ')
}

/** The JSON body of a successful response, before validation; a bad status raises UpstreamError. */
export async function readJson(response: Response, what: string): Promise<unknown> {
  if (!response.ok) {
    await response.body?.cancel()
    throw new UpstreamError(`${what}: HTTP ${response.status}`)
  }
  try {
    return await response.json()
  } catch (cause) {
    throw new UpstreamError(`${what}: the body is not JSON`, { cause })
  }
}

/** The response body validated by Typia; a bad status or payload raises UpstreamError. */
export async function parseBody<T>(
  response: Response,
  validate: (input: unknown) => IValidation<T>,
  what: string,
): Promise<T> {
  const result = validate(await readJson(response, what))
  if (!result.success) {
    throw new UpstreamError(`${what}: unexpected payload at ${failedPaths(result.errors)}`)
  }
  return result.data
}
