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
  counts: VerdictCounts
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
  checked: { questions: number; requests: number; cacheHits: number; model: string | null }
  // Epoch milliseconds the trial data was fetched.
  dataAsOf: number
}

// Problem Details `type` values the web app tells apart.
export const PROBLEM_TYPES = {
  unknownCity: 'https://trialscout.cc/problems/unknown-city',
  unknownCountry: 'https://trialscout.cc/problems/unknown-country',
  rateLimited: 'https://trialscout.cc/problems/rate-limited',
} as const
