import type { Hook } from '@hono/typia-validator'
import type { Context, Hono, Env as HonoEnv } from 'hono'
import type { IValidation } from 'typia'

// RFC 7807 Problem Details for every error the API returns. Details name fields, never
// values, so no profile content ever appears in a response.

export const PROBLEM_JSON = 'application/problem+json'

const PHRASES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  409: 'Conflict',
  413: 'Content Too Large',
  415: 'Unsupported Media Type',
  418: "I'm a Teapot",
  422: 'Unprocessable Content',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  501: 'Not Implemented',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
}

/** An error the API means to return, with its status, detail and headers. */
export class ProblemError extends Error {
  readonly status: number
  readonly detail: string
  readonly headers: Record<string, string>

  constructor(status: number, detail: string, headers: Record<string, string> = {}) {
    super(detail)
    this.status = status
    this.detail = detail
    this.headers = headers
  }
}

/** ClinicalTrials.gov failed or returned a payload we could not validate. */
export class UpstreamError extends Error {}

/** Jev is not configured, failed, or answered outside a question's options. */
export class JudgeError extends Error {}

export function problem(
  status: number,
  detail: string,
  headers: Record<string, string> = {},
  type = 'about:blank',
): Response {
  const body = { type, title: PHRASES[status] ?? 'Error', status, detail }
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': PROBLEM_JSON },
  })
}

export type RequestPart = 'query' | 'path' | 'body'

/** Typia error paths (`$input.sites[0].city`) as request fields (`body.sites.0.city`), once each. */
export function fieldPaths(errors: IValidation.IError[], where: RequestPart): string[] {
  const fields = errors.map((error) => {
    const field = error.path
      .replace(/^\$input/, '')
      .replace(/\[(\d+)\]/g, '.$1')
      .replace(/\["((?:[^"\\]|\\.)*)"\]/g, '.$1')
    return `${where}${field}`
  })
  return [...new Set(fields)]
}

function invalidRequest(errors: IValidation.IError[], where: RequestPart): string {
  return `Invalid request: ${fieldPaths(errors, where).join(', ')}`
}

/** The validated value, or a 422 naming each invalid field as `where.field`. */
export function validOr422<T>(result: IValidation<T>, where: RequestPart): T {
  if (result.success) return result.data
  throw new ProblemError(422, invalidRequest(result.errors, where))
}

/** A `typiaValidator` hook that answers an invalid request with a 422 Problem. */
export function problemHook<T, E extends HonoEnv, P extends string>(
  where: RequestPart,
): Hook<T, E, P> {
  return (result) =>
    result.success ? undefined : problem(422, invalidRequest(result.errors, where))
}

function describe(c: Context): string {
  return `${c.req.method} ${new URL(c.req.url).pathname}`
}

/** An error and its causes, one per line, for the Worker log. */
function causes(error: unknown): string {
  const lines: string[] = []
  for (let e: unknown = error; e !== undefined && lines.length < 5; ) {
    lines.push(e instanceof Error ? `${e.name}: ${e.message}` : String(e))
    e = e instanceof Error ? e.cause : undefined
  }
  return lines.join('\n  caused by ')
}

export function registerProblemHandlers<E extends HonoEnv>(app: Hono<E>): void {
  app.notFound(() => problem(404, 'Not Found'))
  app.onError((error, c) => {
    if (error instanceof ProblemError) return problem(error.status, error.detail, error.headers)
    if (error instanceof UpstreamError) {
      console.warn(`Upstream failure on ${describe(c)}`, causes(error))
      return problem(502, 'Trial data is unavailable right now. Try again later.')
    }
    if (error instanceof JudgeError) {
      console.warn(`Jev failure on ${describe(c)}`, causes(error))
      return problem(503, 'Trial checks are unavailable right now. Try again later.')
    }
    // Log the real cause server-side; never send it to the client.
    console.error(`Unhandled exception on ${describe(c)}`, causes(error))
    return problem(500, 'An unexpected error occurred.')
  })
}
