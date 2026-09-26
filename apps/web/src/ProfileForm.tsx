import type { CancerStage, Profile } from '@trialscout/contract'
import { type JSX, type SubmitEvent, useState } from 'react'
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

type Props = {
  initial: Profile | null
  onSaved: (profile: Profile) => void
}

function FieldError({ id, show }: { id: ProfileField; show: boolean }): JSX.Element | null {
  return show ? (
    <p id={`${id}-error`} className="field-error">
      {MESSAGES[id]}
    </p>
  ) : null
}

// The guided profile form. M1.11 adds the search call and the rest of the guidance.
export function ProfileForm({ initial, onSaved }: Props): JSX.Element {
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
    onSaved(result.profile)
  }

  const describedBy = (field: ProfileField): string | undefined =>
    invalid.has(field) ? `${field}-error` : undefined

  return (
    <form className="profile-form" onSubmit={submit} noValidate>
      <label htmlFor="cancerType">Cancer type</label>
      <input
        id="cancerType"
        name="cancerType"
        defaultValue={initial?.cancerType}
        aria-invalid={invalid.has('cancerType')}
        aria-describedby={describedBy('cancerType')}
      />
      <FieldError id="cancerType" show={invalid.has('cancerType')} />

      <label htmlFor="stage">Stage</label>
      <select
        id="stage"
        name="stage"
        defaultValue={initial?.stage ?? ''}
        aria-invalid={invalid.has('stage')}
        aria-describedby={describedBy('stage')}
      >
        <option value="">Choose…</option>
        {STAGES.map((stage) => (
          <option key={stage.value} value={stage.value}>
            {stage.label}
          </option>
        ))}
      </select>
      <FieldError id="stage" show={invalid.has('stage')} />

      <label htmlFor="age">Age</label>
      <input
        id="age"
        name="age"
        inputMode="numeric"
        defaultValue={initial?.age}
        aria-invalid={invalid.has('age')}
        aria-describedby={describedBy('age')}
      />
      <FieldError id="age" show={invalid.has('age')} />

      <label htmlFor="sex">Sex</label>
      <select
        id="sex"
        name="sex"
        defaultValue={initial?.sex ?? ''}
        aria-invalid={invalid.has('sex')}
        aria-describedby={describedBy('sex')}
      >
        <option value="">Choose…</option>
        <option value="female">Female</option>
        <option value="male">Male</option>
      </select>
      <FieldError id="sex" show={invalid.has('sex')} />

      <label htmlFor="country">Country</label>
      <input
        id="country"
        name="country"
        autoComplete="country-name"
        defaultValue={initial?.country}
        aria-invalid={invalid.has('country')}
        aria-describedby={describedBy('country')}
      />
      <FieldError id="country" show={invalid.has('country')} />

      <label htmlFor="city">City</label>
      <input
        id="city"
        name="city"
        autoComplete="address-level2"
        defaultValue={initial?.city}
        aria-invalid={invalid.has('city')}
        aria-describedby={describedBy('city')}
      />
      <FieldError id="city" show={invalid.has('city')} />

      <label htmlFor="maxDistanceKm">How far can you travel? (km)</label>
      <input
        id="maxDistanceKm"
        name="maxDistanceKm"
        inputMode="numeric"
        defaultValue={initial?.maxDistanceKm}
        aria-invalid={invalid.has('maxDistanceKm')}
        aria-describedby={describedBy('maxDistanceKm')}
      />
      <FieldError id="maxDistanceKm" show={invalid.has('maxDistanceKm')} />

      <label htmlFor="notes">Past treatments, medicines and other conditions (optional)</label>
      <textarea
        id="notes"
        name="notes"
        rows={5}
        defaultValue={initial?.notes}
        aria-invalid={invalid.has('notes')}
        aria-describedby={describedBy('notes')}
      />
      <FieldError id="notes" show={invalid.has('notes')} />

      <button type="submit">Save profile</button>
    </form>
  )
}
