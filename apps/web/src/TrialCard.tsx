import type { TrialResult } from '@trialscout/contract'
import type { JSX } from 'react'
import { type CountVerdict, countParts, phaseLabel } from './format.ts'

// Verdicts are told apart by icon and label, never by colour alone.
const ICONS: Record<CountVerdict, string> = {
  likely_meets: '✓',
  likely_fails: '✕',
  ask_your_doctor: '?',
  not_checked: '…',
}

function siteLabel(trial: TrialResult): string {
  const site = trial.nearestSite
  if (site === null) return 'Distance not known'
  const place = [site.facility, site.city].filter((part) => part !== null && part !== '').join(', ')
  return `${place === '' ? 'Nearest site' : place} · ${site.distanceKm} km`
}

export function TrialCard({ trial }: { trial: TrialResult }): JSX.Element {
  const phase = phaseLabel(trial.phases)
  return (
    <article className="trial-card" aria-labelledby={`${trial.nctId}-title`}>
      <h3 id={`${trial.nctId}-title`} className="trial-title">
        <a href={trial.url} target="_blank" rel="noreferrer">
          {trial.title}
          <span className="visually-hidden">
            {' '}
            (official ClinicalTrials.gov page, opens in a new tab)
          </span>
        </a>
      </h3>
      <p className="trial-meta">
        {phase !== null && <span>{phase}</span>}
        {trial.sponsor !== null && <span>{trial.sponsor}</span>}
        <span>{trial.nctId}</span>
      </p>
      <p className="trial-site">{siteLabel(trial)}</p>
      {trial.eligibility === 'unsplittable' ? (
        <p className="trial-unsplit">
          We could not turn this trial's rules into a checklist. Ask your doctor about it.
        </p>
      ) : (
        <ul
          className="verdict-counts"
          aria-label="How your profile compares with this trial's rules"
        >
          {countParts(trial.counts).map((part) => (
            <li key={part.verdict} className={`count count-${part.verdict}`}>
              <span className="count-icon" aria-hidden="true">
                {ICONS[part.verdict]}
              </span>
              <span>{part.label}</span>
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}
