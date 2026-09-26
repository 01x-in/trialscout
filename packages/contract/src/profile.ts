import type { tags } from 'typia'

// The patient profile from the guided form. It lives only in the browser's sessionStorage
// and in the body of a search request; the server never stores or logs it.

export type CancerStage = 'I' | 'II' | 'III' | 'IV' | 'unknown'

// Sex as trial eligibility sections use it (ClinicalTrials.gov `sex`).
export type Sex = 'female' | 'male'

export type Profile = {
  // Free text, e.g. "non-small cell lung cancer".
  cancerType: string & tags.MinLength<2> & tags.MaxLength<120>
  stage: CancerStage
  age: number & tags.Type<'uint32'> & tags.Maximum<120>
  sex: Sex
  country: string & tags.MinLength<2> & tags.MaxLength<80>
  city: string & tags.MinLength<1> & tags.MaxLength<80>
  maxDistanceKm: number & tags.Type<'uint32'> & tags.Minimum<1> & tags.Maximum<20000>
  // Treatment history, medications and other conditions, in the patient's own words.
  notes?: string & tags.MaxLength<4000>
}
