import type { Profile } from '@trialscout/contract'
import { type JSX, useState } from 'react'
import {
  type CheckTrial,
  checkTrial as checkTrialApi,
  type SearchOutcome,
  searchTrials,
} from './api.ts'
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
        <p className="lede">
          Tell us about your cancer. We check recruiting trials on ClinicalTrials.gov, rule by rule,
          and show which ones are worth discussing with your doctor.
        </p>
        <ol className="steps" aria-label="How it works">
          <li>Tell us about the cancer</li>
          <li>We check every rule of nearby recruiting trials</li>
          <li>Take your questions to your doctor</li>
        </ol>
        <ProfileForm
          initial={initial}
          onSubmit={(profile) => void run(profile)}
          busy={state.kind === 'searching'}
          placeError={placeError}
        />
        <p role="status" className="status">
          {statusText(state)}
        </p>
        {state.kind === 'searching' && (
          // Placeholder cards while the search runs; the status line says what is happening.
          <div className="skeleton-list" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton-card">
                <div className="skeleton-line skeleton-title" />
                <div className="skeleton-line" />
                <div className="skeleton-line skeleton-short" />
              </div>
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
