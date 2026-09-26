import {
  PROBLEM_TYPES,
  type Profile,
  type SearchResponse,
  type TrialResult,
} from '@trialscout/contract'
import { studyUrl, type Trial } from './trial.ts'
import { conditionTerms, FALLBACK_LIMIT } from './fallback.ts'
import { applyHardFilters, type Candidate, explainEmpty, type HardFilterInput } from './filters.ts'
import { locate } from './geo/locate.ts'
import type { JudgeTrial } from './judge/judge.ts'
import { countVerdicts, UNSPLITTABLE_COUNTS } from './judge/verdict.ts'
import { ProblemError, UpstreamError } from './problems.ts'
import { rankTrials } from './ranking.ts'
import type { Services } from './services.ts'

// One search: the patient's place, recruiting trials near it, hard filters, criteria
// (split once per trial version), Jev verdicts within the budget, and the ranked list.
// The profile is used here and discarded; nothing about it is stored or logged.

async function fetchTrials(
  services: Services,
  query: Parameters<Services['ctgov']['search']>[0],
): Promise<Trial[]> {
  const found: Trial[] = []
  let pageToken: string | undefined
  for (let page = 0; page < services.settings.maxPages; page++) {
    const result = await services.ctgov.search(query, {
      pageSize: services.settings.pageSize,
      ...(pageToken === undefined ? {} : { pageToken }),
    })
    found.push(...result.trials)
    if (result.nextPageToken === null) break
    pageToken = result.nextPageToken
  }
  return found
}

type Found = { source: SearchResponse['source']; kept: Candidate[]; dataAsOf: number }

/** Saved trials that pass the hard filters, dated by the oldest check; null when none do. */
async function savedTrials(
  services: Services,
  condition: string,
  filters: HardFilterInput,
): Promise<Found | null> {
  const saved = await services.store.recruiting(conditionTerms(condition), FALLBACK_LIMIT)
  const { kept } = applyHardFilters(
    saved.map((s) => s.trial),
    filters,
  )
  if (kept.length === 0) return null
  const checkedAt = new Map(saved.map((s) => [s.trial.nctId, s.checkedAt]))
  const dataAsOf = Math.min(...kept.map((c) => checkedAt.get(c.trial.nctId) ?? 0))
  return { source: 'saved', kept, dataAsOf }
}

function byDistance(a: Candidate, b: Candidate): number {
  const da = a.nearestSite?.distanceKm ?? Number.POSITIVE_INFINITY
  const db = b.nearestSite?.distanceKm ?? Number.POSITIVE_INFINITY
  return da - db
}

export async function search(services: Services, profile: Profile): Promise<SearchResponse> {
  const located = await locate(services.db, profile.city, profile.country)
  if (!located.ok) {
    throw located.reason === 'unknown_country'
      ? new ProblemError(
          422,
          'We do not recognise that country. Try its full English name, such as "India" or "United States".',
          {},
          PROBLEM_TYPES.unknownCountry,
        )
      : new ProblemError(
          422,
          'We could not find that city. Check the spelling, or try the nearest large city.',
          {},
          PROBLEM_TYPES.unknownCity,
        )
  }
  const { place } = located
  const origin = { lat: place.lat, lon: place.lon }
  const filters = {
    age: profile.age,
    sex: profile.sex,
    origin,
    maxDistanceKm: profile.maxDistanceKm,
  }
  const location = { city: place.name, countryCode: place.countryCode }

  let found: Found
  try {
    const fetched = await fetchTrials(services, {
      condition: profile.cancerType,
      ...origin,
      distanceKm: profile.maxDistanceKm,
    })
    const { kept, removed } = applyHardFilters(fetched, filters)
    if (kept.length === 0) {
      return {
        location,
        results: [],
        empty: explainEmpty(fetched.length, removed),
        checked: { questions: 0, requests: 0, cacheHits: 0, model: null },
        source: 'live',
        dataAsOf: services.now(),
      }
    }
    found = { source: 'live', kept, dataAsOf: services.now() }
  } catch (error) {
    if (!(error instanceof UpstreamError)) throw error
    const saved = await savedTrials(services, profile.cancerType, filters)
    // Nothing saved fits: an empty list could wrongly suggest nothing recruits nearby.
    if (saved === null) throw error
    // Fixed text: the upstream error can carry the query, which holds the patient's condition.
    console.warn('ClinicalTrials.gov is unavailable; serving saved trials')
    found = saved
  }

  // Nearest first, so the Jev budget goes to the trials the patient can most easily reach.
  const candidates = [...found.kept].sort(byDistance)
  // A saved trial served during an outage was not checked now, so it is not saved again.
  if (found.source === 'live') await services.store.save(candidates.map((c) => c.trial))
  const splits = await services.store.criteriaFor(candidates.map((c) => c.trial))
  const toJudge: JudgeTrial[] = []
  for (const { trial } of candidates) {
    const split = splits.get(trial.nctId)
    if (split?.ok) {
      toJudge.push({
        nctId: trial.nctId,
        title: trial.title,
        conditions: trial.conditions,
        criteria: split.criteria,
      })
    }
  }
  const report = await services.judge.judgeSearch(profile, toJudge, services.settings.budget)

  const results: TrialResult[] = candidates.map(({ trial, nearestSite }) => {
    const verdicts = report.trials.get(trial.nctId)
    return {
      nctId: trial.nctId,
      title: trial.title,
      phases: trial.phases,
      sponsor: trial.sponsor,
      url: studyUrl(trial.nctId),
      nearestSite:
        nearestSite === null
          ? null
          : {
              facility: nearestSite.facility,
              city: nearestSite.city,
              country: nearestSite.country,
              distanceKm: Math.round(nearestSite.distanceKm),
            },
      eligibility: verdicts === undefined ? 'unsplittable' : 'split',
      counts:
        verdicts === undefined
          ? UNSPLITTABLE_COUNTS
          : countVerdicts(verdicts.map((v) => v.verdict)),
    }
  })
  const ranked = rankTrials(
    results.map((r) => ({ ...r, distanceKm: r.nearestSite?.distanceKm ?? null })),
  ).map(({ distanceKm: _distance, ...result }) => result)

  return {
    location,
    results: ranked,
    empty: null,
    checked: {
      questions: report.questionsAsked,
      requests: report.requests,
      cacheHits: report.cacheHits,
      model: report.model,
    },
    source: found.source,
    dataAsOf: found.dataAsOf,
  }
}
