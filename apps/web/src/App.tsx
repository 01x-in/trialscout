import type { Profile } from '@trialscout/contract'
import { type JSX, useState } from 'react'
import {
  type CheckTrial,
  checkTrial as checkTrialApi,
  type SearchOutcome,
  searchTrials,
} from './api.ts'
import { Card } from '@/components/ui/card.tsx'
import { Skeleton } from '@/components/ui/skeleton.tsx'
import { type PlaceError, ProfileForm } from './ProfileForm.tsx'
import { loadProfile } from './profile.ts'
import { Results } from './Results.tsx'
import { SiteHeader } from './SiteHeader.tsx'

type Search = (profile: Profile) => Promise<SearchOutcome>

type State =
  | { kind: 'idle' }
  | { kind: 'searching' }
  | { kind: 'done'; outcome: SearchOutcome; profile: Profile }

function statusText(state: State): string {
  if (state.kind === 'searching') {
    return 'Checking trials against your profile. This can take up to a minute.'
  }
  if (state.kind !== 'done') return ''
  switch (state.outcome.kind) {
    case 'rate_limited':
      return 'You have searched a lot in a short time. Please try again in a few minutes.'
    case 'unavailable':
      return 'We could not check trials right now. Please try again later.'
    default:
      return ''
  }
}

type Props = { search?: Search; checkTrial?: CheckTrial }

export function App({ search = searchTrials, checkTrial = checkTrialApi }: Props): JSX.Element {
  const [initial] = useState(loadProfile)
  const [state, setState] = useState<State>({ kind: 'idle' })

  async function run(profile: Profile): Promise<void> {
    setState({ kind: 'searching' })
    setState({ kind: 'done', outcome: await search(profile), profile })
  }

  // The form stays filled in (and in sessionStorage), so a changed answer re-runs the search
  // without typing the rest again.
  // Focusing scrolls the field into view, with no motion.
  function editProfile(): void {
    document.getElementById('cancerType')?.focus()
  }

  const placeError: PlaceError | null =
    state.kind === 'done' && state.outcome.kind === 'unknown_place'
      ? { field: state.outcome.field, message: state.outcome.message }
      : null

  return (
    <>
      <SiteHeader page="search" />
      <main className="mx-auto max-w-3xl px-4 pt-8 pb-16 [overflow-wrap:break-word]">
        <h1 className="font-semibold text-3xl tracking-tight sm:text-4xl">TrialScout</h1>
        <p className="mt-3 text-lg text-muted-foreground leading-relaxed">
          Tell us about your cancer. We check recruiting trials on ClinicalTrials.gov, rule by rule,
          and show which ones are worth discussing with your doctor.
        </p>
        {/* The step numbers are drawn by CSS, so each step reads as its words alone. */}
        <ol
          className="mt-6 mb-8 grid gap-3 text-sm [counter-reset:step] sm:grid-cols-3"
          aria-label="How it works"
        >
          {[
            'Tell us about the cancer',
            'We check every rule of nearby recruiting trials',
            'Take your questions to your doctor',
          ].map((step) => (
            <li
              key={step}
              className="flex items-start gap-3 [counter-increment:step] before:grid before:size-7 before:shrink-0 before:place-items-center before:rounded-full before:bg-primary-soft before:font-semibold before:text-primary before:content-[counter(step)]"
            >
              <span className="pt-1">{step}</span>
            </li>
          ))}
        </ol>
        <ProfileForm
          initial={initial}
          onSubmit={(profile) => void run(profile)}
          busy={state.kind === 'searching'}
          placeError={placeError}
        />
        <p role="status" className="mt-4 min-h-6 text-muted-foreground">
          {statusText(state)}
        </p>
        {state.kind === 'searching' && (
          // Placeholder cards while the search runs; the status line says what is happening.
          <div className="skeleton-list mt-4 grid gap-4" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <Card key={i} className="skeleton-card gap-3 px-5">
                <Skeleton className="h-5 w-4/5" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/5" />
              </Card>
            ))}
          </div>
        )}
        {state.kind === 'done' && state.outcome.kind === 'results' && (
          <Results
            response={state.outcome.response}
            profile={state.profile}
            checkTrial={checkTrial}
            onEdit={editProfile}
          />
        )}
      </main>
    </>
  )
}
