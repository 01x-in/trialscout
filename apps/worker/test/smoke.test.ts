import { DISCLAIMER, type SearchResponse } from '@trialscout/contract'
import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { SMOKE_PROFILE, smoke } from '../scripts/lib/smoke.ts'
import { createApp } from '../src/app.ts'
import { createDb } from '../src/db/index.ts'
import type { Fetch } from '../src/http.ts'
import { seedPlaces, type TestOptions, testServices } from './helpers.ts'
import { json, mockFetch } from './recorded.ts'

// The deploy smoke test (scripts/smoke.ts), run against the real API with recorded
// ClinicalTrials.gov answers and a fake Jev, behind a fake build of the web app.

beforeEach(async () => {
  await seedPlaces(createDb(env.DB))
})

const SITE = 'https://trialscout.test'
const SCRIPT = '/assets/index-Ab12Cd.js'
const STYLES = '/assets/index-Ef34Gh.css'
const HTML = `<!doctype html><html lang="en"><head><title>TrialScout</title>
<script type="module" crossorigin src="${SCRIPT}"></script>
<link rel="stylesheet" crossorigin href="${STYLES}"></head>
<body><div id="root"></div></body></html>`
const BUILD = {
  script: `const e=${JSON.stringify(DISCLAIMER)};export{e};`,
  styles:
    '.demo-caution{background:#9b1c1c}.sheet-caution{border:1px solid}' +
    '@media print{.demo-caution{border:2px solid #000}.doctor-sheet *{color:#000}}',
}

type Api = (path: string, init?: RequestInit) => Promise<Response>

/** The API Worker, as the web Worker's service binding reaches it. */
function realApi(options: TestOptions = {}): Api {
  const app = createApp(testServices(options))
  return (path, init) => Promise.resolve(app.request(path, init, env))
}

type Seen = { url: string; method: string; body: string | null }

const VIDEO = '/demo/trialscout-demo.mp4'
const VIDEO_BYTES = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112])

/**
 * How the static assets answer for the demo files: `ranges` like a healthy site, `whole` never
 * 206, `missing` a 404, `spa` the app's index.html for every path (what a deployment without
 * the files gives), `html-video` and `html-captions` everything good but that one file.
 */
type Demo = 'ranges' | 'whole' | 'missing' | 'spa' | 'html-video' | 'html-captions'

function demoFile(pathname: string, init: RequestInit | undefined, demo: Demo): Response | null {
  if (!pathname.startsWith('/demo/')) return null
  if (demo === 'missing') return new Response('not found', { status: 404 })
  if (demo === 'spa') return new Response(HTML, { headers: type('text/html; charset=utf-8') })
  if (demo === 'html-video' && pathname === VIDEO) {
    return new Response(HTML, { status: 206, headers: type('text/html; charset=utf-8') })
  }
  if (demo === 'html-captions' && pathname === '/demo/captions.vtt') {
    return new Response(HTML, { headers: type('text/html; charset=utf-8') })
  }
  if (pathname === '/demo/poster.jpg') return new Response('jpg', { headers: type('image/jpeg') })
  if (pathname === '/demo/captions.vtt')
    return new Response('WEBVTT', { headers: type('text/vtt') })
  if (pathname !== VIDEO) return null
  const range = new Headers(init?.headers).get('Range')
  if (demo === 'ranges' && range === 'bytes=0-1') {
    return new Response(VIDEO_BYTES.slice(0, 2), {
      status: 206,
      headers: { 'Content-Type': 'video/mp4', 'Content-Range': `bytes 0-1/${VIDEO_BYTES.length}` },
    })
  }
  return new Response(VIDEO_BYTES, { headers: type('video/mp4') })
}

/** The web Worker: the static build, and /api/* passed to `api`. */
function site(api: Api, build = BUILD, seen: Seen[] = [], demo: Demo = 'ranges'): Fetch {
  return async (input, init) => {
    const body = typeof init?.body === 'string' ? init.body : null
    seen.push({ url: input, method: init?.method ?? 'GET', body })
    const { pathname } = new URL(input)
    if (pathname.startsWith('/api/')) return api(pathname, init)
    const file = demoFile(pathname, init, demo)
    if (file !== null) return file
    if (pathname === SCRIPT) return new Response(build.script, { headers: type('text/javascript') })
    if (pathname === STYLES) return new Response(build.styles, { headers: type('text/css') })
    return new Response(HTML, { headers: type('text/html; charset=utf-8') })
  }
}

function type(contentType: string): HeadersInit {
  return { 'Content-Type': contentType }
}

/** ClinicalTrials.gov answering every request with no trials. */
const NO_TRIALS: Fetch = mockFetch(() => json(200, { studies: [], totalCount: 0 }))
const DOWN: Fetch = mockFetch(() => json(503, 'Service Unavailable'))

describe('the deploy smoke test', () => {
  it('passes on a healthy site, checking the pages, the disclaimer, a search and a trial', async () => {
    const result = await smoke(SITE, site(realApi()))

    expect(result.lines.join('\n')).not.toContain('FAILED')
    expect(result.ok).toBe(true)
    expect(result.lines).toEqual([
      'home page: ok',
      'search page: ok',
      'about page: ok',
      'demo video: video, poster and captions are served; the video answers a Range request with 206',
      'disclaimer: exact text in the app; the print styles keep it on the page and the doctor sheet',
      'bad request: 422 Problem Details',
      expect.stringMatching(
        /^search: \d+ trials near Pune, live from ClinicalTrials\.gov; \d+ Jev questions in \d+ requests, \d+ from the cache$/,
      ),
      expect.stringMatching(/^trial NCT\d{8}: \d+ criteria, each next to its source text$/),
    ])
  })

  it('fails when the video cannot be fetched in parts, since Safari will not play it', async () => {
    const result = await smoke(SITE, site(realApi(), BUILD, [], 'whole'))

    expect(result.ok).toBe(false)
    expect(result.lines).toContain(
      'demo video: FAILED: the video answered a Range request with HTTP 200, not 206',
    )
  })

  it("fails when the demo files come back as the app's page, which a missing file does with a 200", async () => {
    const result = await smoke(SITE, site(realApi(), BUILD, [], 'spa'))

    expect(result.ok).toBe(false)
    expect(result.lines).toContain(
      'demo video: FAILED: /demo/poster.jpg is not an image (text/html; charset=utf-8)',
    )
  })

  it("fails when the captions come back as the app's page", async () => {
    const result = await smoke(SITE, site(realApi(), BUILD, [], 'html-captions'))

    expect(result.ok).toBe(false)
    expect(result.lines).toContain(
      'demo video: FAILED: /demo/captions.vtt is not captions (text/html; charset=utf-8)',
    )
  })

  it('fails when the video is not a video, even if it answers a range', async () => {
    const result = await smoke(SITE, site(realApi(), BUILD, [], 'html-video'))

    expect(result.ok).toBe(false)
    expect(result.lines).toContain(
      'demo video: FAILED: /demo/trialscout-demo.mp4 is not a video (text/html; charset=utf-8)',
    )
  })

  it('fails when the demo files are missing', async () => {
    const result = await smoke(SITE, site(realApi(), BUILD, [], 'missing'))

    expect(result.ok).toBe(false)
    expect(result.lines).toContain('demo video: FAILED: /demo/poster.jpg: HTTP 404')
  })

  it('sends the made-up profile only as a JSON body, never in a URL', async () => {
    const seen: Seen[] = []
    await smoke(SITE, site(realApi(), BUILD, seen))

    const posts = seen.filter((s) => s.method === 'POST' && s.body?.includes('Pune'))
    expect(posts.map((s) => new URL(s.url).pathname)).toEqual([
      '/api/search',
      expect.stringMatching(/^\/api\/trials\/NCT\d{8}\/verdicts$/),
    ])
    for (const s of posts) expect(JSON.parse(s.body ?? '')).toEqual(SMOKE_PROFILE)
    for (const s of seen) expect(s.url).not.toMatch(/Pune|lung|India/i)
    // Made up, with no free-text notes.
    expect(SMOKE_PROFILE).not.toHaveProperty('notes')
  })

  it('fails when the app does not carry the exact disclaimer', async () => {
    const reworded = { ...BUILD, script: `const e=${JSON.stringify(DISCLAIMER.slice(0, -1))};` }
    const result = await smoke(SITE, site(realApi(), reworded))

    expect(result.ok).toBe(false)
    expect(result.lines).toContain('disclaimer: FAILED: the exact text is not in the app')
  })

  it('fails when the print styles do not show the disclaimer', async () => {
    const result = await smoke(SITE, site(realApi(), { ...BUILD, styles: '.demo-caution{}' }))

    expect(result.ok).toBe(false)
    expect(result.lines).toContain(
      'disclaimer: FAILED: the stylesheet has no print styles for the disclaimer',
    )
  })

  it('fails when there are no styles for the doctor sheet disclaimer', async () => {
    const styles = BUILD.styles.replace('.sheet-caution', '.sheet-note')
    const result = await smoke(SITE, site(realApi(), { ...BUILD, styles }))

    expect(result.ok).toBe(false)
    expect(result.lines).toContain(
      'disclaimer: FAILED: the stylesheet has no styles for the doctor sheet disclaimer',
    )
  })

  it.each([
    '.sheet-caution{display:none}',
    '.doctor-sheet .sheet-caution, .x { visibility: hidden }',
    '.demo-caution{display: none !important}',
  ])('fails when a print style hides a disclaimer: %s', async (rule) => {
    const styles = BUILD.styles.replace(/\}$/, `${rule}}`)
    const result = await smoke(SITE, site(realApi(), { ...BUILD, styles }))

    expect(result.ok).toBe(false)
    expect(result.lines).toContain('disclaimer: FAILED: a style hides the disclaimer')
  })

  it.each(['.sheet-caution{display:none}', '.demo-caution{visibility:hidden}'])(
    'fails when a base style, outside print, hides a disclaimer: %s',
    async (rule) => {
      const styles = `${rule}${BUILD.styles}`
      const result = await smoke(SITE, site(realApi(), { ...BUILD, styles }))

      expect(result.ok).toBe(false)
      expect(result.lines).toContain('disclaimer: FAILED: a style hides the disclaimer')
    },
  )

  it('does not mistake a longer class name for a disclaimer', async () => {
    const styles = `.sheet-caution-icon{display:none}.demo-caution-note{display:none}${BUILD.styles}`
    const result = await smoke(SITE, site(realApi(), { ...BUILD, styles }))

    expect(result.ok).toBe(true)
  })

  it('opens the first trial whose criteria were split, not an unsplittable one', async () => {
    const seen: Seen[] = []
    const api = realApi()
    let expected: string | undefined
    const firstUnsplittable: Api = async (path, init) => {
      const response = await api(path, init)
      if (path !== '/api/search' || init?.body === '{}') return response
      const found = (await response.json()) as SearchResponse
      const [first] = found.results
      if (first === undefined) throw new Error('Expected recorded trials')
      first.eligibility = 'unsplittable'
      expected = found.results.find((r) => r.eligibility === 'split')?.nctId
      return json(200, found)
    }
    const result = await smoke(SITE, site(firstUnsplittable, BUILD, seen))

    expect(result.ok).toBe(true)
    expect(expected).toMatch(/^NCT\d{8}$/)
    const opened = seen.filter((s) => s.url.includes('/verdicts')).map((s) => new URL(s.url))
    expect(opened.map((u) => u.pathname)).toEqual([`/api/trials/${expected}/verdicts`])
  })

  it('fails when no trial found has split criteria', async () => {
    const api = realApi()
    const allUnsplittable: Api = async (path, init) => {
      const response = await api(path, init)
      if (path !== '/api/search' || init?.body === '{}') return response
      const found = (await response.json()) as SearchResponse
      for (const r of found.results) r.eligibility = 'unsplittable'
      return json(200, found)
    }
    const result = await smoke(SITE, site(allUnsplittable))

    expect(result.ok).toBe(false)
    expect(result.lines).toContainEqual(
      expect.stringMatching(/^search: FAILED: none of the \d+ trials had its criteria split$/),
    )
  })

  it('fails when the API accepts a request it should reject', async () => {
    const lax: Api = async (path, init) =>
      init?.body === '{}' ? json(200, {}) : realApi()(path, init)
    const result = await smoke(SITE, site(lax))

    expect(result.ok).toBe(false)
    expect(result.lines).toContain('bad request: FAILED: expected 422, got HTTP 200')
  })

  it('fails, and skips the trial, when a search finds no trials', async () => {
    const result = await smoke(SITE, site(realApi({ fetch: NO_TRIALS })))

    expect(result.ok).toBe(false)
    expect(result.lines).toContain('search: FAILED: no trials found near Pune')
    expect(result.lines).toContain('trial: skipped, since the search failed')
  })

  it('fails when ClinicalTrials.gov is down and the site serves saved trials', async () => {
    // A first search saves the trials the fallback then serves.
    expect((await smoke(SITE, site(realApi()))).ok).toBe(true)
    const result = await smoke(SITE, site(realApi({ fetch: DOWN })))

    expect(result.ok).toBe(false)
    expect(result.lines).toContain(
      'search: FAILED: served saved trials, since ClinicalTrials.gov did not answer; run it again later',
    )
  })

  it('fails with the Problem Details message when the search is rate limited', async () => {
    const api = realApi({ limits: [{ count: 1, seconds: 60 }] })
    expect((await smoke(SITE, site(api))).ok).toBe(true)
    const result = await smoke(SITE, site(api))

    expect(result.ok).toBe(false)
    expect(result.lines).toContain(
      'search: FAILED: HTTP 429: You have searched a lot in a short time. Please try again in a few minutes.',
    )
  })

  it('stops at once when the site does not answer', async () => {
    const seen: Seen[] = []
    const down: Fetch = async (input, init) => {
      seen.push({ url: input, method: init?.method ?? 'GET', body: null })
      return new Response('Bad gateway', { status: 502 })
    }
    const result = await smoke(SITE, down)

    expect(result).toEqual({ ok: false, lines: ['home page: FAILED: HTTP 502'] })
    expect(seen).toHaveLength(1)
  })
})
