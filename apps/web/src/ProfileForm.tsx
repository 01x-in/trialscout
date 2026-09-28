import type { CancerStage, Profile, Sex } from '@trialscout/contract'
import { type JSX, type ReactNode, type SubmitEvent, useState } from 'react'
import { ANY_DISTANCE_KM, ANY_DISTANCE_LABEL, distanceText } from './format.ts'
import { checkProfile, formToCandidate, type ProfileField, saveProfile } from './profile.ts'

const LABELS: Record<ProfileField, string> = {
  cancerType: 'Cancer type',
  stage: 'Stage',
  age: 'Age',
  sex: 'Sex',
  country: 'Country',
  city: 'City',
  maxDistanceKm: 'How far can you travel? (km)',
  notes: 'Past treatments, medicines and other conditions',
}

// Form order, for the error summary.
const FIELDS = Object.keys(LABELS) as ProfileField[]

const MESSAGES: Record<ProfileField, string> = {
  cancerType: 'Enter your cancer type.',
  stage: 'Choose a stage, or "Not sure".',
  age: 'Enter your age in whole years.',
  sex: 'Choose female, male or other.',
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

const SEXES: { value: Sex; label: string }[] = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'other', label: 'Other' },
]

const DISTANCE_PICKS: { km: number; label: string }[] = [
  ...[50, 100, 300, 1000].map((km) => ({ km, label: `${km.toLocaleString('en-GB')} km` })),
  { km: ANY_DISTANCE_KM, label: ANY_DISTANCE_LABEL },
]
const NOTES_LIMIT = 4000

const number = (n: number): string => n.toLocaleString('en-GB')

export type PlaceError = { field: 'city' | 'country'; message: string }

type Props = {
  initial: Profile | null
  onSubmit: (profile: Profile) => void
  busy: boolean
  // The server could not find the city or country.
  placeError: PlaceError | null
}

type Aria = { 'aria-invalid': boolean; 'aria-describedby': string | undefined }

type FieldProps = {
  id: ProfileField
  hint?: string
  error: string | null
  // More ids that describe the control, such as a character counter.
  describedBy?: string[]
  // Shown after the control, such as quick picks or a counter.
  after?: ReactNode
  children: (aria: Aria) => ReactNode
}

function Field({ id, hint, error, describedBy = [], after, children }: FieldProps): JSX.Element {
  const described = [hint ? `${id}-hint` : null, ...describedBy, error ? `${id}-error` : null]
  const ids = described.filter((d): d is string => d !== null)
  return (
    <div className="field">
      <label htmlFor={id}>{LABELS[id]}</label>
      {hint && (
        <p id={`${id}-hint`} className="field-hint">
          {hint}
        </p>
      )}
      {children({
        'aria-invalid': error !== null,
        'aria-describedby': ids.length > 0 ? ids.join(' ') : undefined,
      })}
      {after}
      {error && (
        <p id={`${id}-error`} className="field-error">
          {error}
        </p>
      )}
    </div>
  )
}

// A few options, all in view, one tap each: plain radio buttons on one line. A group with a
// label, not a <fieldset>/<legend>, so every browser lays it out like the other fields. The
// first radio carries the field's id, so the error summary's link lands on it.
function Choice<T extends string>({
  id,
  options,
  checked,
  error,
}: {
  id: ProfileField
  options: { value: T; label: string }[]
  checked: T | undefined
  error: string | null
}): JSX.Element {
  return (
    <div
      className="field"
      role="radiogroup"
      aria-labelledby={`${id}-label`}
      aria-describedby={error ? `${id}-error` : undefined}
    >
      <p id={`${id}-label`} className="field-label">
        {LABELS[id]}
      </p>
      <div className="radios">
        {options.map((option, i) => (
          <label key={option.value} className="radio">
            <input
              type="radio"
              id={i === 0 ? id : undefined}
              name={id}
              value={option.value}
              defaultChecked={checked === option.value}
              aria-invalid={error !== null}
            />
            {option.label}
          </label>
        ))}
      </div>
      {error && (
        <p id={`${id}-error`} className="field-error">
          {error}
        </p>
      )}
    </div>
  )
}

// A titled group of questions. A heading rather than a <fieldset>/<legend>: Safari draws a
// legend on the card's border, and headings let screen readers jump between sections.
function Section({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  const id = `section-${title.toLowerCase().replace(/[^a-z]+/g, '-')}`
  return (
    <div role="group" aria-labelledby={id} className="form-section">
      <h2 id={id}>{title}</h2>
      {children}
    </div>
  )
}

function focusField(field: ProfileField): void {
  document.getElementById(field)?.focus()
}

// The guided profile form, one page in four short sections. The profile is kept only in
// this browser tab (sessionStorage).
export function ProfileForm({ initial, onSubmit, busy, placeError }: Props): JSX.Element {
  const [invalid, setInvalid] = useState<ProfileField[]>([])
  const [distance, setDistance] = useState(
    initial === null ? '' : distanceText(initial.maxDistanceKm),
  )
  const [notesLength, setNotesLength] = useState(initial?.notes?.length ?? 0)

  function submit(event: SubmitEvent<HTMLFormElement>): void {
    event.preventDefault()
    const result = checkProfile(formToCandidate(new FormData(event.currentTarget)))
    if (!result.ok) {
      const fields = FIELDS.filter((f) => result.fields.includes(f))
      setInvalid(fields)
      if (fields[0] !== undefined) focusField(fields[0])
      return
    }
    setInvalid([])
    saveProfile(result.profile)
    onSubmit(result.profile)
  }

  const error = (field: ProfileField): string | null => {
    if (invalid.includes(field)) return MESSAGES[field]
    if (placeError?.field === field) return placeError.message
    return null
  }

  return (
    <form className="profile-form" onSubmit={submit} noValidate aria-label="Your profile">
      <Section title="About the cancer">
        <Field
          id="cancerType"
          hint='As your doctor or report names it, for example "non-small cell lung cancer".'
          error={error('cancerType')}
        >
          {(aria) => (
            <input id="cancerType" name="cancerType" defaultValue={initial?.cancerType} {...aria} />
          )}
        </Field>

        <Field id="stage" error={error('stage')}>
          {(aria) => (
            <div className="select">
              <select id="stage" name="stage" defaultValue={initial?.stage ?? ''} {...aria}>
                <option value="">Choose…</option>
                {STAGES.map((stage) => (
                  <option key={stage.value} value={stage.value}>
                    {stage.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </Field>
      </Section>

      <Section title="About you">
        <div className="field-row">
          <Field id="age" error={error('age')}>
            {(aria) => (
              <input
                id="age"
                name="age"
                inputMode="numeric"
                defaultValue={initial?.age}
                {...aria}
              />
            )}
          </Field>

          <Choice id="sex" options={SEXES} checked={initial?.sex} error={error('sex')} />
        </div>
      </Section>

      <Section title="Where you are">
        <div className="field-row">
          <Field id="country" error={error('country')}>
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

          <Field id="city" error={error('city')}>
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
          hint="We look for trial sites within this distance of your city."
          error={error('maxDistanceKm')}
          after={
            <div role="group" aria-label="Distance quick picks" className="quick-picks">
              {/* The group has its own name; this is for sighted readers. */}
              <span className="quick-picks-lead" aria-hidden="true">
                Or choose:
              </span>
              {DISTANCE_PICKS.map((pick) => (
                <button
                  key={pick.km}
                  type="button"
                  className="text-pick"
                  aria-pressed={distance === distanceText(pick.km)}
                  onClick={() => setDistance(distanceText(pick.km))}
                >
                  {pick.label}
                </button>
              ))}
            </div>
          }
        >
          {(aria) => (
            <input
              id="maxDistanceKm"
              name="maxDistanceKm"
              inputMode="numeric"
              value={distance}
              onChange={(event) => setDistance(event.currentTarget.value)}
              {...aria}
            />
          )}
        </Field>
      </Section>

      <Section title="Anything else (optional)">
        <Field
          id="notes"
          hint="In your own words: gene test results, medicines you take, treatments you have had. The more you tell us, the fewer rules we have to leave for your doctor."
          error={error('notes')}
          describedBy={['notes-privacy', 'notes-count']}
          after={
            <div className="field-foot">
              <p id="notes-privacy">Stays in this browser tab. We don't store it.</p>
              <p id="notes-count">
                {number(notesLength)} of {number(NOTES_LIMIT)} characters
              </p>
            </div>
          }
        >
          {(aria) => (
            <textarea
              id="notes"
              name="notes"
              rows={5}
              defaultValue={initial?.notes}
              onChange={(event) => setNotesLength(event.currentTarget.value.length)}
              {...aria}
            />
          )}
        </Field>
      </Section>

      {/* Said plainly before anything is sent. The details are on the About page. */}
      <div role="note" aria-label="Your privacy" className="privacy-note">
        <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
        <p>
          We don't store your answers. They stay in this browser tab. Each check sends them to our
          server, which uses them and then throws them away. No accounts, no tracking.{' '}
          <a href="/about#about-privacy">How we handle your answers</a>
        </p>
      </div>

      {invalid.length > 0 && (
        <div role="alert" className="form-errors">
          <p>Some answers need a look:</p>
          <ul>
            {invalid.map((field) => (
              <li key={field}>
                <a
                  href={`#${field}`}
                  onClick={(event) => {
                    event.preventDefault()
                    focusField(field)
                  }}
                >
                  {LABELS[field]}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {/* On a phone the button stays in reach while the form scrolls. */}
      <div className="form-actions">
        <button type="submit" className="button button-primary" disabled={busy}>
          Find trials
        </button>
      </div>
    </form>
  )
}
