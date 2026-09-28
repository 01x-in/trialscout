import type { EmptyReason, Profile, SearchResponse, TrialResult } from '@trialscout/contract'
import { type JSX, type ReactNode, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button.tsx'
import type { CheckTrial } from './api.ts'
import { dateLabel, profileSummary, whereLabel } from './format.ts'
import { TrialCard } from './TrialCard.tsx'

// Trials shown at first, and added by each "Show more".
const PAGE = 10

// Focused from code when results arrive: no ring on a heading nobody tabbed to.
const HEADING = 'scroll-mt-40 font-semibold text-2xl tracking-tight focus:outline-none'

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
      <p className="rounded-md border-primary border-l-4 bg-card px-4 py-3">
        ClinicalTrials.gov is not answering right now, so these trials come from our saved copy,
        last checked on {date}. Some may have changed or closed since. Check the official page of
        any trial before you talk to your doctor.
      </p>
    )
  }
  return (
    <p className="text-muted-foreground text-sm">Trial details from ClinicalTrials.gov, {date}.</p>
  )
}

// A search reads a fixed number of trials in ClinicalTrials.gov's own order, which is not by
// distance. When it lists more, say so: the nearest trials may not all have been checked.
function Coverage({
  listed,
  maxDistanceKm,
  city,
}: {
  listed: SearchResponse['listed']
  maxDistanceKm: number
  city: string
}): JSX.Element | null {
  if (listed.total === null || listed.total <= listed.read) return null
  const n = (x: number): string => x.toLocaleString('en-GB')
  return (
    <p className="text-muted-foreground text-sm">
      ClinicalTrials.gov lists {n(listed.total)} recruiting trials {whereLabel(maxDistanceKm, city)}
      . We checked the first {n(listed.read)} it gave us, which are not always the nearest. Choose a
      smaller distance to check the nearest ones.
    </p>
  )
}

// The search at a glance: who it was checked for, what came back, and a way back.
function Summary({
  response,
  profile,
  onEdit,
  children,
}: Pick<Props, 'response' | 'profile' | 'onEdit'> & { children: ReactNode }): JSX.Element {
  return (
    <section
      className="mt-4 grid justify-items-start gap-2 rounded-xl bg-muted p-5"
      aria-label="Your search"
    >
      <p className="font-semibold">Checked for: {profileSummary(profile)}</p>
      {children}
      <Coverage
        listed={response.listed}
        maxDistanceKm={profile.maxDistanceKm}
        city={response.location.city}
      />
      <DataAsOf response={response} />
      <Button type="button" variant="outline" className="mt-2" onClick={onEdit}>
        Change your answers
      </Button>
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
    <section className="mt-10" aria-labelledby={id}>
      <h3 id={id} className="font-semibold text-xl tracking-tight">
        {title}
      </h3>
      {note && <p className="mt-1 text-muted-foreground text-sm">{note}</p>}
      <div className="mt-4 grid gap-4">
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
  const where = whereLabel(profile.maxDistanceKm, response.location.city)

  useEffect(() => {
    if (focusId !== null) document.getElementById(`trial-${focusId}`)?.focus()
  }, [focusId])

  // New results replace the old ones below the form: take the reader (and screen reader)
  // there. The results mount afresh for each search.
  useEffect(() => {
    const heading = document.getElementById('results-heading')
    heading?.focus({ preventScroll: true })
    // Instantly, not smoothly: motion is kept for loading and expanding.
    heading?.scrollIntoView?.({ block: 'start' })
  }, [])

  if (response.empty !== null || response.results.length === 0) {
    return (
      <section className="mt-10" aria-labelledby="results-heading">
        <h2 id="results-heading" tabIndex={-1} className={HEADING}>
          No trials to show
        </h2>
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

  // Four groups, each in the API's order. "Nothing likely rules you out" is only claimed for
  // a trial whose every rule was checked. One with rules left unchecked (the search's Jev
  // budget ran out) may still hold a likely fail, and opening it checks the rest. One whose
  // rules could not be read cannot be checked at all: ask the doctor. Trials with a likely
  // fail come last, as the API ranks them. Pages run through the groups in this order.
  const fails = (t: TrialResult): boolean => t.counts.likely_fails > 0
  const unread = (t: TrialResult): boolean => t.eligibility === 'unsplittable'
  const clear = response.results.filter(
    (t) => !fails(t) && !unread(t) && t.counts.not_checked === 0,
  )
  const partly = response.results.filter((t) => !fails(t) && !unread(t) && t.counts.not_checked > 0)
  const unreadable = response.results.filter((t) => !fails(t) && unread(t))
  const out = response.results.filter(fails)
  const all = [...clear, ...partly, ...unreadable, ...out]
  const visible = new Set(all.slice(0, shown).map((t) => t.nctId))
  const left = all.length - shown
  const next = Math.min(PAGE, left)

  function showMore(): void {
    setFocusId(all[shown]?.nctId ?? null)
    setShown(shown + PAGE)
  }

  const count = all.length
  return (
    <section className="mt-10" aria-labelledby="results-heading">
      <h2 id="results-heading" tabIndex={-1} className={HEADING}>
        Trials worth discussing with your doctor
      </h2>
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
        id="trials-partly"
        title={`Not fully checked (${partly.length})`}
        note="The search found nothing that likely rules you out, but it did not check every rule of these trials. Opening a trial checks the rest."
        trials={partly.filter((t) => visible.has(t.nctId))}
        profile={profile}
        checkTrial={checkTrial}
      />
      <TrialGroup
        id="trials-unread"
        title={`Rules we could not read (${unreadable.length})`}
        note="We could not turn these trials' rules into a checklist. Ask your doctor about them."
        trials={unreadable.filter((t) => visible.has(t.nctId))}
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
        <Button
          type="button"
          variant="outline"
          className="show-more mt-6 w-full"
          onClick={showMore}
        >
          Show {next} more{left > next ? ` (${left} left)` : ''}
        </Button>
      )}
    </section>
  )
}
