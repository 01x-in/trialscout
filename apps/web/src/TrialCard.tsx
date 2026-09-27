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

// Small line icons, drawn inline so no icon font or third-party asset loads.
function PinIcon(): JSX.Element {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  )
}

function ExternalIcon(): JSX.Element {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </svg>
  )
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
    <article
      id={`trial-${trial.nctId}`}
      className="trial-card"
      aria-labelledby={`${trial.nctId}-title`}
      // Focusable from code only: "Show more" moves focus to the first new card.
      tabIndex={-1}
    >
      <h3 id={`${trial.nctId}-title`} className="trial-title">
        {trial.title}
      </h3>
      <ul className="trial-tags" aria-label="About this trial">
        {phase !== null && <li className="tag">{phase}</li>}
        <li className="tag tag-id">{trial.nctId}</li>
        {trial.sponsor !== null && <li className="trial-sponsor">{trial.sponsor}</li>}
      </ul>
      <p className="trial-site">
        <PinIcon />
        {siteLabel(trial)}
      </p>
      {trial.eligibility === 'unsplittable' ? (
        <p className="trial-unsplit">
          We could not turn this trial's rules into a checklist. Ask your doctor about it.
        </p>
      ) : (
        <>
          {/* Proportions at a glance; the counts below carry the meaning in words. */}
          <div className="verdict-bar" aria-hidden="true">
            {countParts(trial.counts).map((part) => (
              <span
                key={part.verdict}
                className={`verdict-bar-${part.verdict}`}
                style={{ flexGrow: part.count }}
              />
            ))}
          </div>
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
        </>
      )}
      <div className="trial-actions">
        <button
          type="button"
          className="button button-secondary trial-toggle"
          aria-expanded={open}
          aria-controls={detailsId}
          onClick={() => void toggle()}
        >
          {open ? 'Hide the rules' : 'Check each rule'}
        </button>
        <a
          className="trial-official"
          href={trial.url}
          target="_blank"
          rel="noreferrer"
          aria-label={`Official page for ${trial.title} (opens in a new tab)`}
        >
          Official page
          <ExternalIcon />
        </a>
      </div>
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
            <button type="button" className="button button-secondary trial-toggle" onClick={print}>
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
