import type { EmptyReason, Profile, SearchResponse, TrialResult } from '@trialscout/contract'
import { type JSX, type ReactNode, useEffect, useState } from 'react'
import type { CheckTrial } from './api.ts'
import { dateLabel, profileSummary } from './format.ts'
import { TrialCard } from './TrialCard.tsx'

// Trials shown at first, and added by each "Show more".
const PAGE = 10

function emptyMessage(reason: EmptyReason, where: string): string {
  switch (reason) {
    case 'none_nearby':
      return `We found no recruiting trials for this cancer type ${where}.`
    case 'age':
      return `The recruiting trials ${where} are for people of a different age.`
    case 'sex':
      return `The recruiting trials ${where} are only for people of the other sex.`
    case 'no_open_site_nearby':
      return `The trials we found do not have a site recruiting ${where} yet.`
  }
}

type Props = {
  response: SearchResponse
  profile: Profile
  checkTrial: CheckTrial
  // Takes the patient back to the form, still filled in, to change an answer.
  onEdit: () => void
}

// Where the trial details came from, and how current they are.
function DataAsOf({ response }: { response: SearchResponse }): JSX.Element {
  const date = dateLabel(response.dataAsOf)
  if (response.source === 'saved') {
    return (
      <p className="results-note results-saved">
        ClinicalTrials.gov is not answering right now, so these trials come from our saved copy,
        last checked on {date}. Some may have changed or closed since. Check the official page of
        any trial before you talk to your doctor.
      </p>
    )
  }
  return <p className="results-note">Trial details from ClinicalTrials.gov, {date}.</p>
}

// The search at a glance: who it was checked for, what came back, and a way back.
function Summary({
  response,
  profile,
  onEdit,
  children,
}: Pick<Props, 'response' | 'profile' | 'onEdit'> & { children: ReactNode }): JSX.Element {
  return (
    <section className="results-summary" aria-label="Your search">
      <p className="checked-for">Checked for: {profileSummary(profile)}</p>
      {children}
      <DataAsOf response={response} />
      <button type="button" className="button button-secondary" onClick={onEdit}>
        Change your answers
      </button>
    </section>
  )
}

function TrialGroup({
  id,
  title,
  note,
  trials,
  ...card
}: {
  id: string
  title: string
  note?: string
  trials: TrialResult[]
} & Pick<Props, 'profile' | 'checkTrial'>): JSX.Element | null {
  if (trials.length === 0) return null
  return (
    <section className="trial-group" aria-labelledby={id}>
      <h3 id={id}>{title}</h3>
      {note && <p className="trial-group-note">{note}</p>}
      <div className="trial-list">
        {trials.map((trial) => (
          <TrialCard key={trial.nctId} trial={trial} {...card} />
        ))}
      </div>
    </section>
  )
}

export function Results({ response, profile, checkTrial, onEdit }: Props): JSX.Element {
  const [shown, setShown] = useState(PAGE)
  // The first card a "Show more" added, to move focus to once it is on the page.
  const [focusId, setFocusId] = useState<string | null>(null)
  const where = `within ${profile.maxDistanceKm} km of ${response.location.city}`

  useEffect(() => {
    if (focusId !== null) document.getElementById(`trial-${focusId}`)?.focus()
  }, [focusId])

  if (response.empty !== null || response.results.length === 0) {
    return (
      <section className="results" aria-labelledby="results-heading">
        <h2 id="results-heading">No trials to show</h2>
        <Summary response={response} profile={profile} onEdit={onEdit}>
          <p>{emptyMessage(response.empty?.reason ?? 'none_nearby', where)}</p>
          <p>
            Try a larger travel distance
            {response.empty?.reason === 'none_nearby'
              ? ', or a broader cancer type such as "lung cancer".'
              : '.'}
          </p>
        </Summary>
      </section>
    )
  }

  // The API ranks trials with a likely fail last; split there, keeping the order.
  const all = response.results
  const fails = (t: TrialResult): boolean => t.counts.likely_fails > 0
  const clear = all.filter((t) => !fails(t))
  const out = all.filter(fails)
  const visible = new Set(all.slice(0, shown).map((t) => t.nctId))
  const left = all.length - shown
  const next = Math.min(PAGE, left)

  function showMore(): void {
    setFocusId(all[shown]?.nctId ?? null)
    setShown(shown + PAGE)
  }

  const count = all.length
  return (
    <section className="results" aria-labelledby="results-heading">
      <h2 id="results-heading">Trials worth discussing with your doctor</h2>
      <Summary response={response} profile={profile} onEdit={onEdit}>
        <p>
          {count} recruiting {count === 1 ? 'trial' : 'trials'} {where}. Trials where something
          likely rules you out are listed last, not hidden.
        </p>
      </Summary>
      <TrialGroup
        id="trials-clear"
        title={`Nothing likely rules you out (${clear.length})`}
        trials={clear.filter((t) => visible.has(t.nctId))}
        profile={profile}
        checkTrial={checkTrial}
      />
      <TrialGroup
        id="trials-out"
        title={`Something likely rules you out (${out.length})`}
        note="Listed last, not hidden. A likely fail can be wrong: your doctor can check it."
        trials={out.filter((t) => visible.has(t.nctId))}
        profile={profile}
        checkTrial={checkTrial}
      />
      {left > 0 && (
        <button type="button" className="button button-secondary show-more" onClick={showMore}>
          Show {next} more{left > next ? ` (${left} left)` : ''}
        </button>
      )}
    </section>
  )
}
