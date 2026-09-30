import type { Profile } from '@trialscout/contract'
import typia from 'typia'
import { ANY_DISTANCE_KM } from './format.ts'

// The profile lives only in this browser tab's sessionStorage; it is sent to the API only
// in the body of a search, and the server never stores it.
const STORAGE_KEY = 'trialscout.profile'

export type ProfileField = keyof Profile

export type ProfileCheck = { ok: true; profile: Profile } | { ok: false; fields: ProfileField[] }

const validateProfile = typia.createValidate<Profile>()

/** The profile, or the fields that are missing or invalid, in the order Typia reports them. */
export function checkProfile(value: unknown): ProfileCheck {
  const result = validateProfile(value)
  if (result.success) return { ok: true, profile: result.data }
  const fields = result.errors.map((error) => error.path.replace(/^\$input\./, '').split(/[.[]/)[0])
  return { ok: false, fields: [...new Set(fields)] as ProfileField[] }
}

function text(form: FormData, name: string): string {
  const value = form.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

// Typia does not coerce: an empty box is left missing (not 0) so it is reported as missing.
function wholeNumber(form: FormData, name: string): number | undefined {
  const value = text(form, name)
  return value === '' ? undefined : Number(value)
}

/** The raw form values, trimmed and with numbers parsed, ready for `checkProfile`. */
export function formToCandidate(form: FormData): unknown {
  const notes = text(form, 'notes')
  return {
    cancerType: text(form, 'cancerType'),
    stage: text(form, 'stage'),
    age: wholeNumber(form, 'age'),
    sex: text(form, 'sex'),
    country: text(form, 'country'),
    city: text(form, 'city'),
    // The field shows "Any" (or the patient types "any"); the search gets the number.
    maxDistanceKm: /^any\b/i.test(text(form, 'maxDistanceKm'))
      ? ANY_DISTANCE_KM
      : wholeNumber(form, 'maxDistanceKm'),
    ...(notes === '' ? {} : { notes }),
  }
}

export function saveProfile(profile: Profile): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
}

/** The saved profile, or null when there is none or it no longer validates. */
export function loadProfile(): Profile | null {
  const saved = sessionStorage.getItem(STORAGE_KEY)
  if (saved === null) return null
  let value: unknown
  try {
    value = JSON.parse(saved)
  } catch {
    return null
  }
  const result = checkProfile(value)
  return result.ok ? result.profile : null
}
