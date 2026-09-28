import type { tags } from 'typia'

// The patient profile from the guided form. It lives only in the browser's sessionStorage
// and in the body of a search request; the server never stores or logs it.

export type CancerStage = 'I' | 'II' | 'III' | 'IV' | 'unknown'

// Sex as trial eligibility sections use it (ClinicalTrials.gov `sex`), or 'other'. A trial
// limited to one sex is not an assumed fail for 'other': it is kept, and its card says to
// ask the doctor.
export type Sex = 'female' | 'male' | 'other'

// The most maxDistanceKm allows, which the form offers as "Any distance". It means no limit:
// the search reaches past the far side of the Earth (about 20,015 km away).
export const ANY_DISTANCE_KM = 20000

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
