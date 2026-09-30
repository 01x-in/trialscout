import type { CancerStage, Profile, Sex } from '@trialscout/contract'
import { CheckIcon, LockKeyholeIcon } from 'lucide-react'
import { type JSX, type ReactNode, type SubmitEvent, useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Card } from '@/components/ui/card.tsx'
import { Input } from '@/components/ui/input.tsx'
import { Label } from '@/components/ui/label.tsx'
import { NativeSelect } from '@/components/ui/native-select.tsx'
import { Textarea } from '@/components/ui/textarea.tsx'
import { cn } from '@/lib/utils.ts'
import { COUNTRIES } from './countries.ts'
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
  ...[100, 500, 1000].map((km) => ({ km, label: `${km.toLocaleString('en-GB')} km` })),
  { km: ANY_DISTANCE_KM, label: ANY_DISTANCE_LABEL },
]
const NOTES_LIMIT = 4000

const number = (n: number): string => n.toLocaleString('en-GB')

/**
 * The distance the field's text stands for, read as the form reads it on submit: "any" or
 * "Any distance" is ANY_DISTANCE_KM, and a whole number is itself. So typing "20000" shows
 * "Any distance" as chosen, since it is the same search.
 */
function pickedKm(text: string): number | null {
  const value = text.trim()
  if (/^any\b/i.test(value)) return ANY_DISTANCE_KM
  return /^\d+$/.test(value) ? Number(value) : null
}

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
    <div className="grid content-start gap-2">
      <Label htmlFor={id}>{LABELS[id]}</Label>
      {hint && (
        <p id={`${id}-hint`} className="-mt-1 text-muted-foreground text-sm">
          {hint}
        </p>
      )}
      {children({
        'aria-invalid': error !== null,
        'aria-describedby': ids.length > 0 ? ids.join(' ') : undefined,
      })}
      {after}
      {error && (
        <p id={`${id}-error`} className="font-medium text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  )
}

// A few options, all in view, one tap each: a segmented control, as tall as a field, built
// from the browser's own radio buttons (hidden visually, still focused and read as radios).
// The chosen one gets a tick as well as its colour. A group with a label, not a
// <fieldset>/<legend>, so every browser lays it out like the other fields. The first radio
// carries the field's id, so the error summary's link lands on it.
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
      className="grid content-start gap-2"
      role="radiogroup"
      aria-labelledby={`${id}-label`}
      aria-describedby={error ? `${id}-error` : undefined}
    >
      <p id={`${id}-label`} className="font-medium text-base leading-snug">
        {LABELS[id]}
      </p>
      <div
        className={cn(
          'grid h-11 auto-cols-fr grid-flow-col gap-1 rounded-md border border-input bg-background p-1 shadow-xs',
          error !== null && 'border-destructive ring-1 ring-destructive',
        )}
      >
        {options.map((option, i) => (
          <label
            key={option.value}
            className="relative flex cursor-pointer items-center justify-center gap-1.5 rounded-[5px] text-sm transition-colors hover:bg-accent has-checked:bg-primary-soft has-checked:font-semibold has-checked:text-primary has-focus-visible:outline-3 has-focus-visible:outline-primary has-focus-visible:outline-offset-2 [&:not(:has(:checked))>svg]:hidden"
          >
            <input
              type="radio"
              className="sr-only"
              id={i === 0 ? id : undefined}
              name={id}
              value={option.value}
              defaultChecked={checked === option.value}
              aria-invalid={error !== null}
            />
            <CheckIcon aria-hidden="true" className="size-4" />
            {option.label}
          </label>
        ))}
      </div>
      {error && (
        <p id={`${id}-error`} className="font-medium text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  )
}

function focusField(field: ProfileField): void {
  document.getElementById(field)?.focus()
}

// The profile form: one card, eight questions. The profile is kept only in this browser tab
// (sessionStorage).
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
    <form className="@container grid gap-6" onSubmit={submit} noValidate aria-label="Your profile">
      <Card className="gap-5 px-5 py-6 sm:px-6">
        <Field id="cancerType" error={error('cancerType')}>
          {(aria) => (
            <Input
              id="cancerType"
              name="cancerType"
              placeholder="non-small cell lung cancer"
              defaultValue={initial?.cancerType}
              {...aria}
            />
          )}
        </Field>

        <Field id="stage" error={error('stage')}>
          {(aria) => (
            <NativeSelect
              wrapperClassName="select"
              id="stage"
              name="stage"
              defaultValue={initial?.stage ?? ''}
              {...aria}
            >
              <option value="">Choose…</option>
              {STAGES.map((stage) => (
                <option key={stage.value} value={stage.value}>
                  {stage.label}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>

        <div className="grid gap-5 @md:grid-cols-2">
          <Field id="age" error={error('age')}>
            {(aria) => (
              <Input
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

        <div className="grid gap-5 @md:grid-cols-2">
          <Field id="country" error={error('country')}>
            {(aria) => (
              <>
                <Input
                  id="country"
                  name="country"
                  list="country-suggestions"
                  autoComplete="country-name"
                  defaultValue={initial?.country}
                  {...aria}
                />
                {/* Suggestions only: the box still takes anything typed, like "USA" or "UK". */}
                <datalist id="country-suggestions">
                  {COUNTRIES.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </>
            )}
          </Field>

          <Field id="city" error={error('city')}>
            {(aria) => (
              <Input
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
          error={error('maxDistanceKm')}
          after={
            <div
              role="group"
              aria-label="Distance quick picks"
              className="flex flex-wrap items-center gap-x-1 text-sm"
            >
              {DISTANCE_PICKS.map((pick) => (
                // Plain text buttons, like links; the chosen one is bold, with a tick, and not
                // underlined. Each is a 44px touch target.
                <button
                  key={pick.km}
                  type="button"
                  className="text-pick inline-flex h-11 cursor-pointer touch-manipulation items-center gap-1 px-2 text-primary underline underline-offset-4 aria-pressed:font-semibold aria-pressed:text-foreground aria-pressed:no-underline [&:not([aria-pressed=true])>svg]:hidden"
                  aria-pressed={pickedKm(distance) === pick.km}
                  onClick={() => setDistance(distanceText(pick.km))}
                >
                  <CheckIcon aria-hidden="true" className="size-4 text-primary" />
                  {pick.label}
                </button>
              ))}
            </div>
          }
        >
          {(aria) => (
            <Input
              id="maxDistanceKm"
              name="maxDistanceKm"
              inputMode="numeric"
              value={distance}
              onChange={(event) => setDistance(event.currentTarget.value)}
              {...aria}
            />
          )}
        </Field>

        <Field
          id="notes"
          hint="Optional. In your own words: gene test results, medicines you take, treatments you have had. The more you tell us, the fewer rules we have to leave for your doctor."
          error={error('notes')}
          describedBy={['notes-privacy', 'notes-count']}
          after={
            <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-muted-foreground text-sm">
              <p id="notes-privacy">Stays in this browser tab. We don't store it.</p>
              <p id="notes-count" className="tabular-nums">
                {number(notesLength)} of {number(NOTES_LIMIT)} characters
              </p>
            </div>
          }
        >
          {(aria) => (
            <Textarea
              id="notes"
              name="notes"
              rows={5}
              defaultValue={initial?.notes}
              onChange={(event) => setNotesLength(event.currentTarget.value.length)}
              {...aria}
            />
          )}
        </Field>
      </Card>

      {/* Said plainly before anything is sent. The details are on the About page. */}
      <Alert role="note" aria-label="Your privacy" variant="muted">
        <LockKeyholeIcon aria-hidden="true" />
        <AlertDescription>
          <p>
            We don't store your answers. They stay in this browser tab. Each check sends them to our
            server, which uses them and then throws them away. No accounts, no tracking.{' '}
            <a href="/about#about-privacy">How we handle your answers</a>
          </p>
        </AlertDescription>
      </Alert>

      {invalid.length > 0 && (
        <Alert role="alert" variant="destructive">
          <AlertTitle>Some answers need a look:</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-5">
              {invalid.map((field) => (
                <li key={field}>
                  <a
                    href={`#${field}`}
                    className="text-foreground"
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
          </AlertDescription>
        </Alert>
      )}
      {/* On a phone, and in the split layout, the button stays in reach at the bottom while the
          form scrolls. */}
      <div className="form-actions max-sm:sticky max-sm:bottom-0 max-sm:z-10 max-sm:-mx-4 max-sm:border-t max-sm:bg-background/95 max-sm:px-4 max-sm:py-3 max-sm:backdrop-blur lg:sticky lg:bottom-0 lg:z-10 lg:border-t lg:bg-background/95 lg:py-3 lg:backdrop-blur">
        <Button
          type="submit"
          size="lg"
          className="w-full sm:w-auto sm:min-w-48 lg:w-full"
          disabled={busy}
        >
          Find trials
        </Button>
      </div>
    </form>
  )
}
