import type { EmptyReason, Profile, SearchResponse } from '@trialscout/contract'
import type { JSX } from 'react'
import type { CheckTrial } from './api.ts'
import { dateLabel } from './format.ts'
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

type Props = { response: SearchResponse; profile: Profile; checkTrial: CheckTrial }

export function Results({ response, profile, checkTrial }: Props): JSX.Element {
  const where = `within ${profile.maxDistanceKm} km of ${response.location.city}`
  const asOf = `Trial details from ClinicalTrials.gov, ${dateLabel(response.dataAsOf)}.`

  if (response.empty !== null || response.results.length === 0) {
    return (
      <section className="results" aria-labelledby="results-heading">
        <h2 id="results-heading">No trials to show</h2>
        <p>{emptyMessage(response.empty?.reason ?? 'none_nearby', where)}</p>
        <p>
          Try a larger travel distance
          {response.empty?.reason === 'none_nearby'
            ? ', or a broader cancer type such as "lung cancer".'
            : '.'}
        </p>
        <p className="results-note">{asOf}</p>
      </section>
    )
  }

  const count = response.results.length
  return (
    <section className="results" aria-labelledby="results-heading">
      <h2 id="results-heading">Trials worth discussing with your doctor</h2>
      <p>
        {count} recruiting {count === 1 ? 'trial' : 'trials'} {where}. Trials where something likely
        rules you out are listed last, not hidden.
      </p>
      <p className="results-note">{asOf}</p>
      <div className="trial-list">
        {response.results.map((trial) => (
          <TrialCard key={trial.nctId} trial={trial} profile={profile} checkTrial={checkTrial} />
        ))}
      </div>
    </section>
  )
}
