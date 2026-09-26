// A recruiting trial as the app uses it, normalised from ClinicalTrials.gov.

export type TrialSex = 'ALL' | 'FEMALE' | 'MALE'

export type Site = {
  facility: string | null
  city: string | null
  state: string | null
  country: string | null
  // The site's own recruitment status, e.g. RECRUITING or NOT_YET_RECRUITING.
  status: string | null
  // Null when ClinicalTrials.gov has no coordinates for the site.
  lat: number | null
  lon: number | null
}

export type Trial = {
  nctId: string
  title: string
  // e.g. ['PHASE2'] or ['PHASE1', 'PHASE2']; empty when not applicable.
  phases: string[]
  sponsor: string | null
  conditions: string[]
  status: string
  // YYYY-MM-DD (or YYYY-MM); with nctId it identifies the trial version.
  lastUpdated: string | null
  eligibility: {
    // The verbatim eligibility section; null when the trial has none.
    criteria: string | null
    sex: TrialSex
    // Null means no limit.
    minimumAgeYears: number | null
    maximumAgeYears: number | null
  }
  sites: Site[]
}

const UNIT_YEARS: Record<string, number> = {
  year: 1,
  month: 1 / 12,
  week: 1 / 52.1775,
  day: 1 / 365.25,
  hour: 1 / (365.25 * 24),
  minute: 1 / (365.25 * 24 * 60),
}

/** "18 Years", "6 Months" and so on as years; null for a missing or unreadable limit. */
export function ageInYears(text: string | undefined): number | null {
  const match = /^(\d+(?:\.\d+)?)\s+(year|month|week|day|hour|minute)s?$/i.exec(text?.trim() ?? '')
  if (match === null) return null
  const [, amount, unit] = match
  const factor = UNIT_YEARS[unit?.toLowerCase() ?? '']
  return factor === undefined ? null : Number(amount) * factor
}
