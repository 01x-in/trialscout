import type { Profile, TrialResult } from '@trialscout/contract'
import { type JSX, useEffect, useState } from 'react'
import { createPortal, flushSync } from 'react-dom'
import type { CheckTrial, TrialOutcome } from './api.ts'
import { Checklist } from './Checklist.tsx'
import { DoctorSheet } from './DoctorSheet.tsx'
import { countParts, phaseLabel, VERDICT_ICONS } from './format.ts'

function siteLabel(trial: TrialResult): string {
  const site = trial.nearestSite
  if (site === null) return 'Distance not known'
  const place = [site.facility, site.city].filter((part) => part !== null && part !== '').join(', ')
  return `${place === '' ? 'Nearest site' : place} · ${site.distanceKm} km`
}

type Check = { kind: 'idle' } | { kind: 'checking' } | { kind: 'done'; outcome: TrialOutcome }

function checkMessage(check: Check): string {
  if (check.kind === 'checking') {
    return 'Checking each rule of this trial. This can take up to a minute.'
  }
  if (check.kind !== 'done') return ''
  switch (check.outcome.kind) {
    case 'rate_limited':
      return 'You have checked a lot of trials in a short time. Please try again in a few minutes.'
    case 'not_found':
      return 'ClinicalTrials.gov no longer lists this trial.'
    case 'unavailable':
      return 'We could not check this trial right now. Please try again later.'
    default:
      return ''
  }
}

type Props = { trial: TrialResult; profile: Profile; checkTrial: CheckTrial }

export function TrialCard({ trial, profile, checkTrial }: Props): JSX.Element {
  const [open, setOpen] = useState(false)
  const [check, setCheck] = useState<Check>({ kind: 'idle' })
  const [printing, setPrinting] = useState(false)
  const phase = phaseLabel(trial.phases)
  const detailsId = `${trial.nctId}-details`

  // While printing, the sheet is the only thing on the page (index.css); afterwards it goes.
  useEffect(() => {
    if (!printing) return
    const done = (): void => setPrinting(false)
    window.addEventListener('afterprint', done)
    return () => {
      window.removeEventListener('afterprint', done)
      document.body.classList.remove('printing-sheet')
    }
  }, [printing])

  function print(): void {
    // Render the sheet first, then print from this click: a print started in an effect
    // would run twice under StrictMode.
    flushSync(() => setPrinting(true))
    document.body.classList.add('printing-sheet')
    window.print()
  }

  async function toggle(): Promise<void> {
    const opening = !open
    setOpen(opening)
    // Checked once; a failed check is tried again the next time the trial is opened.
    if (!opening || check.kind === 'checking') return
    if (check.kind === 'done' && check.outcome.kind === 'verdicts') return
    setCheck({ kind: 'checking' })
    setCheck({ kind: 'done', outcome: await checkTrial(trial.nctId, profile) })
  }

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
                {VERDICT_ICONS[part.verdict]}
              </span>
              <span>{part.label}</span>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className="trial-toggle"
        aria-expanded={open}
        aria-controls={detailsId}
        onClick={() => void toggle()}
      >
        {open ? 'Hide the rules' : 'Check each rule'}
      </button>
      <div id={detailsId} className="trial-details" hidden={!open}>
        <p role="status" className="status">
          {open ? checkMessage(check) : ''}
        </p>
        {open && check.kind === 'done' && check.outcome.kind === 'verdicts' && (
          <>
            <Checklist trial={check.outcome.response} />
            <p className="trial-source">
              <a href={trial.url} target="_blank" rel="noreferrer">
                Read every rule on ClinicalTrials.gov
                <span className="visually-hidden"> (opens in a new tab)</span>
              </a>
            </p>
            <button type="button" className="trial-toggle" onClick={print}>
              Print questions for your doctor
            </button>
          </>
        )}
      </div>
      {printing &&
        check.kind === 'done' &&
        check.outcome.kind === 'verdicts' &&
        createPortal(
          <div className="print-root">
            <DoctorSheet trial={check.outcome.response} profile={profile} site={siteLabel(trial)} />
          </div>,
          document.body,
        )}
    </article>
  )
}
