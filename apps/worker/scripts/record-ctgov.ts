// Records ClinicalTrials.gov API v2 responses for the client tests, using the same request
// parameters as the client. Re-run when the requested fields change. Name recordings to
// record only those:
//
//   cd apps/worker && node scripts/record-ctgov.ts [name ...]

import { mkdir, writeFile } from 'node:fs/promises'
import {
  CTGOV_BASE_URL,
  idsParams,
  searchParams,
  studyParams,
  type TrialQuery,
} from '../src/clients/ctgov-query.ts'

const OUT = new URL('../../../fixtures/ctgov/recorded/', import.meta.url)
const HEADERS = { Accept: 'application/json', 'User-Agent': 'trialscout (+https://trialscout.cc)' }
// Small pages keep the fixtures small; the client's page size is a parameter.
const PAGE_SIZE = 5

type Recording = { path: string; params: Record<string, string>; status: number; body: unknown }

const ONLY = new Set(process.argv.slice(2))

function wanted(name: string): boolean {
  return ONLY.size === 0 || ONLY.has(name)
}

/**
 * Fetches and writes a recording when it is wanted. `needed` fetches it anyway, without
 * writing it, when a later recording depends on it (a page token).
 */
async function record(
  name: string,
  path: string,
  params: Record<string, string>,
  needed = false,
): Promise<Recording | null> {
  if (!wanted(name) && !needed) return null
  const response = await fetch(`${CTGOV_BASE_URL}${path}?${new URLSearchParams(params)}`, {
    headers: HEADERS,
  })
  const text = await response.text()
  let body: unknown = text
  try {
    body = JSON.parse(text)
  } catch {
    // Error bodies are plain text.
  }
  const recording: Recording = { path, params, status: response.status, body }
  if (!wanted(name)) return recording
  await writeFile(new URL(`${name}.json`, OUT), `${JSON.stringify(recording, null, 1)}\n`)
  console.log(`${name}: HTTP ${response.status}, ${text.length} bytes`)
  return recording
}

const PUNE_NSCLC: TrialQuery = {
  condition: 'non-small cell lung cancer',
  lat: 18.5204,
  lon: 73.8567,
  distanceKm: 300,
}
const BOSTON_BREAST: TrialQuery = {
  condition: 'breast cancer',
  lat: 42.3601,
  lon: -71.0589,
  distanceKm: 50,
}
// Ushuaia, Argentina: nothing recruits for this nearby.
const USHUAIA_GLIOBLASTOMA: TrialQuery = {
  condition: 'glioblastoma',
  lat: -54.8019,
  lon: -68.303,
  distanceKm: 50,
}

async function main(): Promise<void> {
  await mkdir(OUT, { recursive: true })
  const first = await record(
    'search-nsclc-pune-p1',
    '/studies',
    searchParams(PUNE_NSCLC, { pageSize: PAGE_SIZE }),
    wanted('search-nsclc-pune-p2'),
  )
  if (first !== null && wanted('search-nsclc-pune-p2')) {
    const token = (first.body as { nextPageToken?: string }).nextPageToken
    if (token === undefined) throw new Error('Expected a second page for NSCLC near Pune')
    await record(
      'search-nsclc-pune-p2',
      '/studies',
      searchParams(PUNE_NSCLC, { pageSize: PAGE_SIZE, pageToken: token }),
    )
  }
  await record(
    'search-breast-boston-p1',
    '/studies',
    searchParams(BOSTON_BREAST, { pageSize: PAGE_SIZE }),
  )
  await record(
    'search-glioblastoma-ushuaia',
    '/studies',
    searchParams(USHUAIA_GLIOBLASTOMA, { pageSize: PAGE_SIZE }),
  )
  await record('study-NCT06563999', '/studies/NCT06563999', studyParams())
  await record('study-NCT09999999', '/studies/NCT09999999', studyParams())
  // The daily refresh: a known trial and one ClinicalTrials.gov does not have.
  await record('studies-by-ids', '/studies', idsParams(['NCT06563999', 'NCT09999999']))
}

await main()
