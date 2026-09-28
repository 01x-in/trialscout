import type { VerdictCounts } from './verdict.ts'

// POST /api/search: the body is a Profile; this is the answer.

export type NearestSite = {
  facility: string | null
  city: string | null
  country: string | null
  distanceKm: number
}

export type TrialResult = {
  nctId: string
  title: string
  // e.g. ['PHASE2']; empty when ClinicalTrials.gov gives none.
  phases: string[]
  sponsor: string | null
  // The official ClinicalTrials.gov page.
  url: string
  // Null when the nearest recruiting site has no coordinates.
  nearestSite: NearestSite | null
  // 'unsplittable': the eligibility text could not be split into criteria; the trial page
  // shows it raw with "ask your doctor".
  eligibility: 'split' | 'unsplittable'
  // The sex ClinicalTrials.gov limits the trial to, or null when it is open to all.
  sexLimit: 'female' | 'male' | null
  counts: VerdictCounts
}

// How much Jev work a request took. `model` is null when every answer came from the cache.
export type JudgeWork = {
  questions: number
  requests: number
  cacheHits: number
  model: string | null
}

export type EmptyReason = 'none_nearby' | 'age' | 'sex' | 'no_open_site_nearby'

export type EmptyExplanation = { reason: EmptyReason; relax: 'distance' }

export type SearchResponse = {
  // Where distances were measured from.
  location: { city: string; countryCode: string }
  // Ranked: trials with no likely fails first; failing trials last, never removed.
  results: TrialResult[]
  // Set when no trial survived the hard filters.
  empty: EmptyExplanation | null
  // How much Jev work this search took.
  checked: JudgeWork
  // 'live': fetched from ClinicalTrials.gov for this search. 'saved': ClinicalTrials.gov
  // was down, so the trials come from the copy saved by earlier searches and the daily
  // refresh; some may have changed or closed since.
  source: 'live' | 'saved'
  // Epoch milliseconds the trial data is current as of: now for a live search, and the
  // oldest check among the trials shown for a saved one.
  dataAsOf: number
  // How many trials ClinicalTrials.gov lists for the search (null when unknown, as for the
  // saved copy), and how many the search read. A search reads a fixed number of pages in
  // ClinicalTrials.gov's own order, which is not by distance, so when `total` is larger the
  // nearest trials may not all be among those checked.
  listed: { total: number | null; read: number }
}

// Problem Details `type` values the web app tells apart.
export const PROBLEM_TYPES = {
  unknownCity: 'https://trialscout.cc/problems/unknown-city',
  unknownCountry: 'https://trialscout.cc/problems/unknown-country',
  rateLimited: 'https://trialscout.cc/problems/rate-limited',
  trialNotFound: 'https://trialscout.cc/problems/trial-not-found',
} as const
