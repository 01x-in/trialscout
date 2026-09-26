import type { CancerStage, Profile } from '@trialscout/contract'
import { type JSX, type ReactNode, type SubmitEvent, useState } from 'react'
import { checkProfile, formToCandidate, type ProfileField, saveProfile } from './profile.ts'

const MESSAGES: Record<ProfileField, string> = {
  cancerType: 'Enter your cancer type.',
  stage: 'Choose a stage, or "Not sure".',
  age: 'Enter your age in whole years.',
  sex: 'Choose female or male.',
  country: 'Enter your country.',
  city: 'Enter your city.',
  maxDistanceKm: 'Enter how far you can travel, from 1 to 20,000 km.',
  notes: 'Keep this under 4,000 characters.',
}

const STAGES: { value: CancerStage; label: string }[] = [
  { value: 'I', label: 'Stage I' },
  { value: 'II', label: 'Stage II' },
  { value: 'III', label: 'Stage III' },
  { value: 'IV', label: 'Stage IV' },
  { value: 'unknown', label: 'Not sure' },
]

export type PlaceError = { field: 'city' | 'country'; message: string }

type Props = {
  initial: Profile | null
  onSubmit: (profile: Profile) => void
  busy: boolean
  // The server could not find the city or country.
  placeError: PlaceError | null
}

type FieldProps = {
  id: ProfileField
  label: string
  hint?: string
  error: string | null
  children: (aria: { 'aria-invalid': boolean; 'aria-describedby': string | undefined }) => ReactNode
}

function Field({ id, label, hint, error, children }: FieldProps): JSX.Element {
  const described = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean)
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {hint && (
        <p id={`${id}-hint`} className="field-hint">
          {hint}
        </p>
      )}
      {children({
        'aria-invalid': error !== null,
        'aria-describedby': described.length > 0 ? described.join(' ') : undefined,
      })}
      {error && (
        <p id={`${id}-error`} className="field-error">
          {error}
        </p>
      )}
    </div>
  )
}

// The guided profile form. The profile is kept only in this browser tab (sessionStorage).
export function ProfileForm({ initial, onSubmit, busy, placeError }: Props): JSX.Element {
  const [invalid, setInvalid] = useState<Set<ProfileField>>(new Set())

  function submit(event: SubmitEvent<HTMLFormElement>): void {
    event.preventDefault()
    const result = checkProfile(formToCandidate(new FormData(event.currentTarget)))
    if (!result.ok) {
      setInvalid(new Set(result.fields))
      return
    }
    setInvalid(new Set())
    saveProfile(result.profile)
    onSubmit(result.profile)
  }

  const error = (field: ProfileField): string | null => {
    if (invalid.has(field)) return MESSAGES[field]
    if (placeError?.field === field) return placeError.message
    return null
  }

  return (
    <form className="profile-form" onSubmit={submit} noValidate aria-label="Your profile">
      <Field
        id="cancerType"
        label="Cancer type"
        hint='As your doctor or report names it, for example "non-small cell lung cancer".'
        error={error('cancerType')}
      >
        {(aria) => (
          <input id="cancerType" name="cancerType" defaultValue={initial?.cancerType} {...aria} />
        )}
      </Field>

      <Field id="stage" label="Stage" error={error('stage')}>
        {(aria) => (
          <select id="stage" name="stage" defaultValue={initial?.stage ?? ''} {...aria}>
            <option value="">Choose…</option>
            {STAGES.map((stage) => (
              <option key={stage.value} value={stage.value}>
                {stage.label}
              </option>
            ))}
          </select>
        )}
      </Field>

      <div className="field-row">
        <Field id="age" label="Age" error={error('age')}>
          {(aria) => (
            <input id="age" name="age" inputMode="numeric" defaultValue={initial?.age} {...aria} />
          )}
        </Field>

        <Field id="sex" label="Sex" error={error('sex')}>
          {(aria) => (
            <select id="sex" name="sex" defaultValue={initial?.sex ?? ''} {...aria}>
              <option value="">Choose…</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
            </select>
          )}
        </Field>
      </div>

      <div className="field-row">
        <Field id="country" label="Country" error={error('country')}>
          {(aria) => (
            <input
              id="country"
              name="country"
              autoComplete="country-name"
              defaultValue={initial?.country}
              {...aria}
            />
          )}
        </Field>

        <Field id="city" label="City" error={error('city')}>
          {(aria) => (
            <input
              id="city"
              name="city"
              autoComplete="address-level2"
              defaultValue={initial?.city}
              {...aria}
            />
          )}
        </Field>
      </div>

      <Field
        id="maxDistanceKm"
        label="How far can you travel? (km)"
        hint="We look for trial sites within this distance of your city."
        error={error('maxDistanceKm')}
      >
        {(aria) => (
          <input
            id="maxDistanceKm"
            name="maxDistanceKm"
            inputMode="numeric"
            defaultValue={initial?.maxDistanceKm}
            {...aria}
          />
        )}
      </Field>

      <Field
        id="notes"
        label="Past treatments, medicines and other conditions (optional)"
        hint="In your own words. The more you tell us, the fewer rules we have to leave for your doctor."
        error={error('notes')}
      >
        {(aria) => (
          <textarea id="notes" name="notes" rows={5} defaultValue={initial?.notes} {...aria} />
        )}
      </Field>

      <button type="submit" disabled={busy}>
        Find trials
      </button>
    </form>
  )
}
