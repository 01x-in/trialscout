import type { Profile, TrialResult } from '@trialscout/contract'
import { ChevronDownIcon, ExternalLinkIcon, MapPinIcon, PrinterIcon } from 'lucide-react'
import { type JSX, useEffect, useState } from 'react'
import { createPortal, flushSync } from 'react-dom'
import { Alert, AlertDescription } from '@/components/ui/alert.tsx'
import { Badge } from '@/components/ui/badge.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card.tsx'
import type { CheckTrial, TrialOutcome } from './api.ts'
import { Checklist } from './Checklist.tsx'
import { DoctorSheet } from './DoctorSheet.tsx'
import { countParts, phaseLabel } from './format.ts'
import { VerdictIcon } from './VerdictIcon.tsx'

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
  // Once every rule is checked, the card shows that check: the search may have left rules
  // "not checked yet", and one of them may be a likely fail. The card stays where it is.
  const counts =
    check.kind === 'done' && check.outcome.kind === 'verdicts'
      ? check.outcome.response.counts
      : trial.counts
  // The card sits in the group the search put it in; say so when the full check finds a
  // likely fail the search did not.
  const newFail = trial.counts.likely_fails === 0 && counts.likely_fails > 0
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
    <Card asChild className="trial-card scroll-mt-40 gap-4">
      <article
        id={`trial-${trial.nctId}`}
        aria-labelledby={`${trial.nctId}-title`}
        // Focusable from code only: "Show more" moves focus to the first new card.
        tabIndex={-1}
      >
        <CardHeader className="gap-2.5">
          <h3 id={`${trial.nctId}-title`} className="font-semibold text-lg leading-snug">
            {trial.title}
          </h3>
          <ul className="flex flex-wrap items-center gap-2 text-sm" aria-label="About this trial">
            {phase !== null && (
              <li>
                <Badge variant="secondary">{phase}</Badge>
              </li>
            )}
            <li>
              <Badge variant="outline" className="font-mono font-normal">
                {trial.nctId}
              </Badge>
            </li>
            {trial.sponsor !== null && <li className="text-muted-foreground">{trial.sponsor}</li>}
          </ul>
        </CardHeader>
        <CardContent className="grid gap-3">
          <p className="flex items-center gap-1.5 text-muted-foreground text-sm">
            <MapPinIcon aria-hidden="true" className="size-4 shrink-0" />
            {siteLabel(trial)}
          </p>
          {trial.eligibility === 'unsplittable' ? (
            <p className="text-ask">
              We could not turn this trial's rules into a checklist. Ask your doctor about it.
            </p>
          ) : (
            <>
              {/* Proportions at a glance; the counts below carry the meaning in words. */}
              <div className="verdict-bar" aria-hidden="true">
                {countParts(counts).map((part) => (
                  <span
                    key={part.verdict}
                    className={`verdict-bar-${part.verdict}`}
                    style={{ flexGrow: part.count }}
                  />
                ))}
              </div>
              <ul
                className="flex flex-wrap gap-2"
                aria-label="How your profile compares with this trial's rules"
              >
                {countParts(counts).map((part) => (
                  <li key={part.verdict}>
                    <Badge variant={part.verdict} className="rounded-full py-1 pr-3 pl-1.5">
                      <VerdictIcon verdict={part.verdict} />
                      <span>{part.label}</span>
                    </Badge>
                  </li>
                ))}
              </ul>
            </>
          )}
          {/* "Other" keeps single-sex trials in; say which sex the trial lists, and to ask. */}
          {profile.sex === 'other' && trial.sexLimit !== null && (
            <Alert variant="ask">
              <AlertDescription>
                ClinicalTrials.gov lists this trial for {trial.sexLimit} patients only. Ask your
                doctor whether it could include you.
              </AlertDescription>
            </Alert>
          )}
          {newFail && (
            <Alert variant="fails">
              <AlertDescription>
                Checking every rule found something that likely rules you out.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter className="gap-x-5 border-t pt-4">
          <Button
            type="button"
            variant="outline"
            className="trial-toggle [&[aria-expanded=true]>svg]:rotate-180 [&>svg]:transition-transform motion-reduce:[&>svg]:transition-none"
            aria-expanded={open}
            aria-controls={detailsId}
            onClick={() => void toggle()}
          >
            {open ? 'Hide the rules' : 'Check each rule'}
            <ChevronDownIcon aria-hidden="true" />
          </Button>
          <a
            className="inline-flex h-11 items-center gap-1.5 font-medium"
            href={trial.url}
            target="_blank"
            rel="noreferrer"
            aria-label={`Official page for ${trial.title} (opens in a new tab)`}
          >
            Official page
            <ExternalLinkIcon aria-hidden="true" className="size-4" />
          </a>
        </CardFooter>
        <div id={detailsId} className="trial-details px-5" hidden={!open}>
          <p role="status" className="text-muted-foreground empty:hidden">
            {open ? checkMessage(check) : ''}
          </p>
          {open && check.kind === 'done' && check.outcome.kind === 'verdicts' && (
            <>
              <div className="trial-toolbar flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="trial-toggle"
                  onClick={print}
                >
                  <PrinterIcon aria-hidden="true" />
                  Print questions for your doctor
                </Button>
              </div>
              <Checklist trial={check.outcome.response} />
              <p className="mt-6">
                <a href={trial.url} target="_blank" rel="noreferrer" className="font-medium">
                  Read every rule on ClinicalTrials.gov
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </p>
            </>
          )}
        </div>
        {printing &&
          check.kind === 'done' &&
          check.outcome.kind === 'verdicts' &&
          createPortal(
            <div className="print-root">
              <DoctorSheet
                trial={check.outcome.response}
                profile={profile}
                site={siteLabel(trial)}
              />
            </div>,
            document.body,
          )}
      </article>
    </Card>
  )
}
