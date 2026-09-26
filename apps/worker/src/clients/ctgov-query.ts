// ClinicalTrials.gov API v2 request parameters. Kept free of Typia so the fixture recorder
// (scripts/record-ctgov.ts) can import it under plain Node and record exactly what the
// client asks for.

export const CTGOV_BASE_URL = 'https://clinicaltrials.gov/api/v2'

// Only the fields the app uses. Site contacts (names, phones, emails) are never requested:
// the app does not contact sites, and they are most of a large trial's payload.
export const CTGOV_FIELDS = [
  'NCTId',
  'BriefTitle',
  'OverallStatus',
  'LastUpdatePostDate',
  'LeadSponsorName',
  'Condition',
  'Phase',
  'StudyType',
  'EligibilityCriteria',
  'Sex',
  'MinimumAge',
  'MaximumAge',
  'LocationFacility',
  'LocationCity',
  'LocationState',
  'LocationCountry',
  'LocationStatus',
  'LocationGeoPoint',
].join(',')

export type TrialQuery = {
  // Free text, as the patient typed it; ClinicalTrials.gov expands synonyms.
  condition: string
  lat: number
  lon: number
  distanceKm: number
}

export type PageRequest = { pageSize: number; pageToken?: string }

/** Recruiting interventional studies for a condition with a site within the distance. */
export function searchParams(query: TrialQuery, page: PageRequest): Record<string, string> {
  return {
    format: 'json',
    'query.cond': query.condition,
    'filter.overallStatus': 'RECRUITING',
    'filter.geo': `distance(${query.lat.toFixed(4)},${query.lon.toFixed(4)},${Math.round(query.distanceKm)}km)`,
    'filter.advanced': 'AREA[StudyType]INTERVENTIONAL',
    fields: CTGOV_FIELDS,
    countTotal: 'true',
    pageSize: String(page.pageSize),
    ...(page.pageToken === undefined ? {} : { pageToken: page.pageToken }),
  }
}

export function studyParams(): Record<string, string> {
  return { format: 'json', fields: CTGOV_FIELDS }
}
