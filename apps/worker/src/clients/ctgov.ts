import typia, { type tags } from 'typia'
import { failedPaths, get, type Http, readJson } from '../http.ts'
import { UpstreamError } from '../problems.ts'
import { ageInYears, type Site, type Trial, type TrialSex } from '../trial.ts'
import { type PageRequest, searchParams, studyParams, type TrialQuery } from './ctgov-query.ts'

// ClinicalTrials.gov API v2 client. Payloads are validated with Typia: the page envelope
// must be right, and each study is validated on its own, so one malformed record is
// skipped (and logged) instead of failing the whole search.

type NctId = string & tags.Pattern<'^NCT[0-9]{8}$'>

type RawLocation = {
  facility?: string
  city?: string
  state?: string
  country?: string
  status?: string
  geoPoint?: {
    lat: number & tags.Minimum<-90> & tags.Maximum<90>
    lon: number & tags.Minimum<-180> & tags.Maximum<180>
  }
}

// The subset of a study that CTGOV_FIELDS asks for. Extra properties are ignored.
type RawStudy = {
  protocolSection: {
    identificationModule: { nctId: NctId; briefTitle: string }
    statusModule: {
      overallStatus: string
      lastUpdatePostDateStruct?: { date: string }
    }
    sponsorCollaboratorsModule?: { leadSponsor?: { name: string } }
    conditionsModule?: { conditions?: string[] }
    designModule?: { phases?: string[] }
    eligibilityModule?: {
      eligibilityCriteria?: string
      sex?: TrialSex
      minimumAge?: string
      maximumAge?: string
    }
    contactsLocationsModule?: {
      locations?: RawLocation[]
    }
  }
}

type RawPage = {
  studies: unknown[]
  nextPageToken?: string
  totalCount?: number & tags.Type<'uint32'>
}

const validatePage = typia.createValidate<RawPage>()
const validateStudy = typia.createValidate<RawStudy>()

export type SearchPage = {
  trials: Trial[]
  nextPageToken: string | null
  totalCount: number | null
}

function toSite(raw: RawLocation): Site {
  return {
    facility: raw.facility ?? null,
    city: raw.city ?? null,
    state: raw.state ?? null,
    country: raw.country ?? null,
    status: raw.status ?? null,
    lat: raw.geoPoint?.lat ?? null,
    lon: raw.geoPoint?.lon ?? null,
  }
}

export function toTrial(raw: RawStudy): Trial {
  const p = raw.protocolSection
  const criteria = p.eligibilityModule?.eligibilityCriteria?.trim()
  return {
    nctId: p.identificationModule.nctId,
    title: p.identificationModule.briefTitle,
    phases: p.designModule?.phases ?? [],
    sponsor: p.sponsorCollaboratorsModule?.leadSponsor?.name ?? null,
    conditions: p.conditionsModule?.conditions ?? [],
    status: p.statusModule.overallStatus,
    lastUpdated: p.statusModule.lastUpdatePostDateStruct?.date ?? null,
    eligibility: {
      criteria: criteria ? criteria : null,
      sex: p.eligibilityModule?.sex ?? 'ALL',
      minimumAgeYears: ageInYears(p.eligibilityModule?.minimumAge),
      maximumAgeYears: ageInYears(p.eligibilityModule?.maximumAge),
    },
    sites: (p.contactsLocationsModule?.locations ?? []).map(toSite),
  }
}

export class CtGovClient {
  readonly #http: Http

  constructor(http: Http) {
    this.#http = http
  }

  /** One page of recruiting interventional trials for the query. */
  async search(query: TrialQuery, page: PageRequest): Promise<SearchPage> {
    const what = 'ClinicalTrials.gov search'
    const response = await get(this.#http, '/studies', searchParams(query, page), what)
    const result = validatePage(await readJson(response, what))
    if (!result.success) {
      throw new UpstreamError(`${what}: unexpected payload at ${failedPaths(result.errors)}`)
    }
    const trials: Trial[] = []
    let skipped = 0
    for (const study of result.data.studies) {
      const checked = validateStudy(study)
      if (checked.success) trials.push(toTrial(checked.data))
      else skipped += 1
    }
    if (skipped > 0) console.warn(`${what}: skipped ${skipped} malformed studies`)
    return {
      trials,
      nextPageToken: result.data.nextPageToken ?? null,
      totalCount: result.data.totalCount ?? null,
    }
  }

  /** One trial by NCT number, or null when ClinicalTrials.gov does not know it. */
  async study(nctId: string): Promise<Trial | null> {
    if (!typia.is<NctId>(nctId)) throw new Error(`Not an NCT number: ${nctId}`)
    const what = `ClinicalTrials.gov study ${nctId}`
    const response = await get(this.#http, `/studies/${nctId}`, studyParams(), what)
    if (response.status === 404) {
      await response.body?.cancel()
      return null
    }
    const result = validateStudy(await readJson(response, what))
    if (!result.success) {
      throw new UpstreamError(`${what}: unexpected payload at ${failedPaths(result.errors)}`)
    }
    return toTrial(result.data)
  }
}
