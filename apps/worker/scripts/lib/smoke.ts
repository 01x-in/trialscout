import { DISCLAIMER, type Profile } from '@trialscout/contract'
import type { Fetch } from '../../src/http.ts'

// The deploy smoke test (M4): the site serves the app with the exact disclaimer strip,
// the API rejects a bad request, and one live search and one opened trial work end to end.
// Runs under plain Node, so answers are checked by hand rather than with Typia.
//
// The search is real: it asks ClinicalTrials.gov and Jev (well under a cent, at the rates in
// docs/jev-budget.md) and uses one of the caller's searches for the minute.

/** Made up, with no notes: no real patient's details ever go to production. */
export const SMOKE_PROFILE: Profile = {
  cancerType: 'non-small cell lung cancer',
  stage: 'IV',
  age: 58,
  sex: 'female',
  country: 'India',
  city: 'Pune',
  maxDistanceKm: 300,
}

const VERDICTS = new Set([
  'likely_meets',
  'likely_fails',
  'ask_your_doctor',
  'not_applicable',
  'not_checked',
])

export type SmokeResult = { ok: boolean; lines: string[] }

type Json = Record<string, unknown>

class Failed extends Error {}

function object(value: unknown, what: string): Json {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Failed(`${what} is not an object`)
  }
  return value as Json
}

function array(value: unknown, what: string): unknown[] {
  if (!Array.isArray(value)) throw new Failed(`${what} is not a list`)
  return value
}

function count(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Failed(`${what} is not a count`)
  }
  return value
}

function text(value: unknown, what: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Failed(`${what} is empty`)
  return value
}

/** A failed response as one line: its status, and the Problem Details message if any. */
async function failure(response: Response): Promise<Failed> {
  const body = await response.text()
  try {
    const detail = (JSON.parse(body) as Json | null)?.detail
    if (typeof detail === 'string') return new Failed(`HTTP ${response.status}: ${detail}`)
  } catch {
    // Not JSON: the status says enough.
  }
  return new Failed(`HTTP ${response.status}`)
}

/** Whether a stylesheet has an `@media print` block that styles the disclaimer strip. */
function printsDisclaimer(css: string): boolean {
  for (let at = css.indexOf('@media print'); at !== -1; at = css.indexOf('@media print', at + 1)) {
    const open = css.indexOf('{', at)
    let depth = 0
    for (let i = open; i !== -1 && i < css.length; i += 1) {
      if (css[i] === '{') depth += 1
      else if (css[i] === '}') depth -= 1
      if (depth === 0) {
        if (css.slice(open, i).includes('.demo-caution')) return true
        break
      }
    }
  }
  return false
}

/** Every same-site asset the page loads with this tag and attribute, e.g. script src. */
function assets(html: string, tag: string, attribute: string): string[] {
  const pattern = new RegExp(`<${tag}\\b[^>]*\\b${attribute}="(/[^"]+)"`, 'g')
  return [...html.matchAll(pattern)].map((m) => m[1] ?? '')
}

export async function smoke(baseUrl: string, fetch: Fetch): Promise<SmokeResult> {
  const lines: string[] = []
  let ok = true
  const at = (path: string): string => new URL(path, baseUrl).toString()

  // Runs one check; a failure is reported on its line and the later checks still run.
  async function check<T>(name: string, run: () => Promise<[string, T]>): Promise<T | null> {
    try {
      const [line, value] = await run()
      lines.push(`${name}: ${line}`)
      return value
    } catch (error) {
      ok = false
      lines.push(`${name}: FAILED: ${error instanceof Error ? error.message : String(error)}`)
      return null
    }
  }

  async function page(path: string): Promise<string> {
    const response = await fetch(at(path), { headers: { Accept: 'text/html' } })
    if (!response.ok) throw await failure(response)
    if (!response.headers.get('Content-Type')?.startsWith('text/html')) {
      throw new Failed(`not HTML (${response.headers.get('Content-Type')})`)
    }
    return response.text()
  }

  async function asset(path: string): Promise<string> {
    const response = await fetch(at(path))
    if (!response.ok) throw new Failed(`${path}: HTTP ${response.status}`)
    return response.text()
  }

  async function post(path: string, body: string): Promise<Response> {
    return fetch(at(path), {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body,
    })
  }

  const home = await check('home page', async () => ['ok', await page('/')])
  if (home === null) return { ok, lines }

  await check('about page', async () => {
    // The web Worker serves the app for any path; the app then shows the About page.
    if (!(await page('/about')).includes('id="root"')) throw new Failed('not the app')
    return ['ok', null]
  })

  await check('disclaimer', async () => {
    const scripts = assets(home, 'script', 'src')
    if (scripts.length === 0) throw new Failed('the home page loads no script')
    const code = await Promise.all(scripts.map(asset))
    if (!code.some((js) => js.includes(DISCLAIMER))) {
      throw new Failed('the exact text is not in the app')
    }
    const styles = await Promise.all(assets(home, 'link', 'href').map(asset))
    if (!styles.some(printsDisclaimer)) {
      throw new Failed('the stylesheet has no print styles for the disclaimer')
    }
    return ['exact text in the app, and in the print styles', null]
  })

  await check('bad request', async () => {
    const response = await post('/api/search', '{}')
    await response.body?.cancel()
    if (response.status !== 422) throw new Failed(`expected 422, got HTTP ${response.status}`)
    if (response.headers.get('Content-Type') !== 'application/problem+json') {
      throw new Failed(`not Problem Details (${response.headers.get('Content-Type')})`)
    }
    return ['422 Problem Details', null]
  })

  const first = await check('search', async () => {
    const response = await post('/api/search', JSON.stringify(SMOKE_PROFILE))
    if (!response.ok) throw await failure(response)
    const found = object(await response.json(), 'the search')
    if (found.source !== 'live') {
      throw new Failed(
        'served saved trials, since ClinicalTrials.gov did not answer; run it again later',
      )
    }
    const city = text(object(found.location, 'location').city, 'location.city')
    const results = array(found.results, 'results').map((r) => object(r, 'a result'))
    const nctId = results[0]?.nctId
    if (nctId === undefined) throw new Failed(`no trials found near ${city}`)
    const checked = object(found.checked, 'checked')
    const work = [
      `${count(checked.questions, 'checked.questions')} Jev questions`,
      `in ${count(checked.requests, 'checked.requests')} requests,`,
      `${count(checked.cacheHits, 'checked.cacheHits')} from the cache`,
    ].join(' ')
    const line = `${results.length} trials near ${city}, live from ClinicalTrials.gov; ${work}`
    return [line, text(nctId, 'nctId')]
  })

  if (first === null) {
    lines.push('trial: skipped, since the search failed')
    return { ok: false, lines }
  }

  await check(`trial ${first}`, async () => {
    const response = await post(`/api/trials/${first}/verdicts`, JSON.stringify(SMOKE_PROFILE))
    if (!response.ok) throw await failure(response)
    const trial = object(await response.json(), 'the trial')
    if (trial.nctId !== first) throw new Failed(`answered for ${String(trial.nctId)}`)
    if (trial.eligibility === 'unsplittable') {
      text(trial.rawCriteria, 'rawCriteria')
      return ['shown as its raw eligibility text', null]
    }
    const criteria = array(trial.criteria, 'criteria').map((c) => object(c, 'a criterion'))
    if (criteria.length === 0) throw new Failed('no criteria')
    for (const [i, c] of criteria.entries()) {
      text(c.text, `criterion ${i + 1}`)
      if (!VERDICTS.has(String(c.verdict))) {
        throw new Failed(`criterion ${i + 1} has verdict ${String(c.verdict)}`)
      }
    }
    return [`${criteria.length} criteria, each next to its source text`, null]
  })

  return { ok, lines }
}
