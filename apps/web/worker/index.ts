// The web Worker: serves the Vite build and hands /api/* to the API Worker through a
// service binding, so the app keeps its relative /api calls on one origin and needs no
// CORS. The API Worker has no public URL of its own.

export type WebEnv = {
  // The API Worker (trialscout-api).
  API: Fetcher
  // The static build in dist/.
  ASSETS: Fetcher
}

// Cloudflare's static assets answer every request with the whole file and ignore Range, and
// Safari will not play a video from a server that does. So /demo/* goes through the Worker,
// which fetches the file whole and cuts out the bytes asked for.
const DEMO = '/demo/'

type Span = { start: number; end: number } | 'unsatisfiable' | null

/** The one byte range a request asks for; null when there is none, or it is not one we honour. */
function parseRange(header: string | null, size: number): Span {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header ?? '')
  if (match === null) return null
  const [, from = '', to = ''] = match
  if (from === '') {
    // "-n" is the last n bytes.
    const last = Number(to)
    if (to === '') return null
    return last === 0 ? 'unsatisfiable' : { start: Math.max(0, size - last), end: size - 1 }
  }
  const start = Number(from)
  if (to !== '' && Number(to) < start) return null
  if (start >= size) return 'unsatisfiable'
  return { start, end: to === '' ? size - 1 : Math.min(Number(to), size - 1) }
}

async function demoFile(request: Request, env: WebEnv): Promise<Response> {
  // Ask for the whole file: the assets binding would ignore a Range header anyway.
  const whole = await env.ASSETS.fetch(new Request(request.url, { method: 'GET' }))
  // A missing file falls back to index.html; that is not a video to cut up.
  if (!whole.ok || whole.headers.get('Content-Type')?.startsWith('text/html')) return whole

  const bytes = await whole.arrayBuffer()
  const headers = new Headers(whole.headers)
  headers.set('Accept-Ranges', 'bytes')
  const head = request.method === 'HEAD'
  const span = parseRange(request.headers.get('Range'), bytes.byteLength)

  if (span === 'unsatisfiable') {
    headers.set('Content-Range', `bytes */${bytes.byteLength}`)
    headers.delete('Content-Length')
    return new Response(null, { status: 416, headers })
  }
  if (span === null) {
    headers.set('Content-Length', String(bytes.byteLength))
    return new Response(head ? null : bytes, { status: 200, headers })
  }
  const part = bytes.slice(span.start, span.end + 1)
  headers.set('Content-Range', `bytes ${span.start}-${span.end}/${bytes.byteLength}`)
  headers.set('Content-Length', String(part.byteLength))
  return new Response(head ? null : part, { status: 206, headers })
}

export async function route(request: Request, env: WebEnv): Promise<Response> {
  const { pathname } = new URL(request.url)
  const api = pathname === '/api' || pathname.startsWith('/api/')
  // The request is passed on whole, so CF-Connecting-IP still names the client.
  if (api) return env.API.fetch(request)
  if (pathname.startsWith(DEMO) && (request.method === 'GET' || request.method === 'HEAD')) {
    return demoFile(request, env)
  }
  return env.ASSETS.fetch(request)
}

// Default export required by the Workers runtime.
export default {
  fetch: (request, env) => route(request, env),
} satisfies ExportedHandler<WebEnv>
