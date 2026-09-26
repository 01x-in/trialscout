import type { EmptyReason, Profile, SearchResponse } from '@trialscout/contract'
import type { JSX } from 'react'
import type { CheckTrial } from './api.ts'
import { dateLabel, profileSummary } from './format.ts'
import { TrialCard } from './TrialCard.tsx'

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

function CheckedFor({ profile, onEdit }: Pick<Props, 'profile' | 'onEdit'>): JSX.Element {
  return (
    <p className="checked-for">
      Checked for: {profileSummary(profile)}{' '}
      <button type="button" className="link-button" onClick={onEdit}>
        Change your answers
      </button>
    </p>
  )
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

export function Results({ response, profile, checkTrial, onEdit }: Props): JSX.Element {
  const where = `within ${profile.maxDistanceKm} km of ${response.location.city}`

  if (response.empty !== null || response.results.length === 0) {
    return (
      <section className="results" aria-labelledby="results-heading">
        <h2 id="results-heading">No trials to show</h2>
        <CheckedFor profile={profile} onEdit={onEdit} />
        <p>{emptyMessage(response.empty?.reason ?? 'none_nearby', where)}</p>
        <p>
          Try a larger travel distance
          {response.empty?.reason === 'none_nearby'
            ? ', or a broader cancer type such as "lung cancer".'
            : '.'}
        </p>
        <DataAsOf response={response} />
      </section>
    )
  }

  const count = response.results.length
  return (
    <section className="results" aria-labelledby="results-heading">
      <h2 id="results-heading">Trials worth discussing with your doctor</h2>
      <CheckedFor profile={profile} onEdit={onEdit} />
      <p>
        {count} recruiting {count === 1 ? 'trial' : 'trials'} {where}. Trials where something likely
        rules you out are listed last, not hidden.
      </p>
      <DataAsOf response={response} />
      <div className="trial-list">
        {response.results.map((trial) => (
          <TrialCard key={trial.nctId} trial={trial} profile={profile} checkTrial={checkTrial} />
        ))}
      </div>
    </section>
  )
}
