import type { Fetch } from '../src/http.ts'

// Replays recorded upstream responses (scripts/record-ctgov.ts). Any request that was not
// recorded, with exactly these parameters, fails the test.

type Recording = { path: string; params: Record<string, string>; status: number; body: unknown }

const CTGOV = import.meta.glob<Recording>('../../../fixtures/ctgov/recorded/*.json', {
  eager: true,
  import: 'default',
})

function canonical(path: string, params: Iterable<[string, string]>): string {
  const sorted = [...params].sort(([a], [b]) => a.localeCompare(b))
  return `${path}?${new URLSearchParams(sorted)}`
}

const BY_REQUEST = new Map(
  Object.values(CTGOV).map((r) => [canonical(r.path, Object.entries(r.params)), r]),
)

export function json(status: number, body: unknown): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** A recorded response by fixture name, e.g. `search-nsclc-pune-p1`. */
export function recording(name: string): Recording {
  const found = CTGOV[`../../../fixtures/ctgov/recorded/${name}.json`]
  if (found === undefined) throw new Error(`No recording named ${name}`)
  return found
}

/** A fetch answered by `handler`, which sees the parsed URL. */
export function mockFetch(handler: (url: URL) => Response | Promise<Response>): Fetch {
  return async (input) => handler(new URL(input))
}

/** ClinicalTrials.gov, replayed from fixtures/ctgov/recorded. */
export function ctgovFetch(seen: URL[] = []): Fetch {
  return mockFetch((url) => {
    seen.push(url)
    const path = url.pathname.replace(/^\/api\/v2/, '')
    const found = BY_REQUEST.get(canonical(path, url.searchParams))
    if (found === undefined) throw new Error(`Unrecorded request: ${url}`)
    return json(found.status, found.body)
  })
}

/** A fetch that fails the test if called at all. */
export function unreachable(): Fetch {
  return mockFetch((url) => {
    throw new Error(`Unexpected upstream request: ${url}`)
  })
}
