import type { Profile, SearchResponse, TrialResult } from '@trialscout/contract'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Results } from './Results.tsx'

// The results list (F3): a summary bar, trials split by whether something likely rules the
// patient out (listed last, never hidden), and ten trials at a time.

const PROFILE: Profile = {
  cancerType: 'breast cancer',
  stage: 'II',
  age: 47,
  sex: 'female',
  country: 'India',
  city: 'Mumbai',
  maxDistanceKm: 100,
}

function trial(n: number, likelyFails = 0): TrialResult {
  const nctId = `NCT${String(n).padStart(8, '0')}`
  return {
    nctId,
    title: `A study of drug ${nctId}`,
    phases: ['PHASE2'],
    sponsor: 'Tata Memorial Hospital',
    url: `https://clinicaltrials.gov/study/${nctId}`,
    nearestSite: null,
    eligibility: 'split',
    sexLimit: null,
    counts: { likely_meets: 2, likely_fails: likelyFails, ask_your_doctor: 3, not_checked: 0 },
  }
}

// Ranked as the API ranks them: trials with a likely fail last.
function trials(passing: number, failing: number): TrialResult[] {
  return [
    ...Array.from({ length: passing }, (_, i) => trial(i + 1)),
    ...Array.from({ length: failing }, (_, i) => trial(passing + i + 1, 1)),
  ]
}

function show(
  results: TrialResult[],
  onEdit = vi.fn(),
  profile: Profile = PROFILE,
  listed: SearchResponse['listed'] = { total: results.length, read: results.length },
): void {
  const response: SearchResponse = {
    location: { city: 'Mumbai', countryCode: 'IN' },
    results,
    empty: null,
    checked: { questions: 40, requests: 4, cacheHits: 0, model: 'jev-1.13.0' },
    source: 'live',
    dataAsOf: Date.UTC(2026, 8, 26),
    listed,
  }
  render(
    <Results
      response={response}
      profile={profile}
      checkTrial={async () => ({ kind: 'unavailable' })}
      onEdit={onEdit}
    />,
  )
}

const cardIds = (): string[] => screen.getAllByRole('article').map((a) => a.id)

describe('the results list', () => {
  it('sums up the search in one bar, with a way back to the answers', () => {
    const onEdit = vi.fn()
    show(trials(2, 0), onEdit)
    const summary = screen.getByRole('region', { name: 'Your search' })

    expect(summary).toHaveTextContent('Checked for: breast cancer, stage II, age 47, female.')
    expect(summary).toHaveTextContent('2 recruiting trials within 100 km of Mumbai.')
    expect(summary).toHaveTextContent('Trial details from ClinicalTrials.gov, 26 September 2026.')
    fireEvent.click(within(summary).getByRole('button', { name: 'Change your answers' }))
    expect(onEdit).toHaveBeenCalledTimes(1)
  })

  it('says "at any distance" when the patient can travel anywhere', () => {
    show(trials(2, 0), vi.fn(), { ...PROFILE, maxDistanceKm: 20000 })

    expect(screen.getByRole('region', { name: 'Your search' })).toHaveTextContent(
      '2 recruiting trials at any distance from Mumbai.',
    )
  })

  // A search reads a fixed number of trials in ClinicalTrials.gov's order, not by distance.
  it('says when ClinicalTrials.gov lists more trials than were checked', () => {
    show(trials(2, 0), vi.fn(), { ...PROFILE, maxDistanceKm: 20000 }, { total: 1076, read: 100 })

    expect(screen.getByRole('region', { name: 'Your search' })).toHaveTextContent(
      'ClinicalTrials.gov lists 1,076 recruiting trials at any distance from Mumbai. We checked the first 100 it gave us, which are not always the nearest. Choose a smaller distance to check the nearest ones.',
    )
  })

  it('says nothing more when every trial listed was checked', () => {
    show(trials(2, 0), vi.fn(), PROFILE, { total: 2, read: 2 })
    expect(screen.queryByText(/We checked the first/)).toBeNull()
  })

  it('says nothing more for the saved copy, whose total is unknown', () => {
    show(trials(2, 0), vi.fn(), PROFILE, { total: null, read: 2 })
    expect(screen.queryByText(/We checked the first/)).toBeNull()
  })

  it('lists trials that something likely rules out last, under their own heading', () => {
    show(trials(2, 1))

    const clear = screen.getByRole('region', { name: 'Nothing likely rules you out (2)' })
    const out = screen.getByRole('region', { name: 'Something likely rules you out (1)' })
    expect(within(clear).getAllByRole('article')).toHaveLength(2)
    expect(within(out).getAllByRole('article')).toHaveLength(1)
    expect(out).toHaveTextContent('Listed last, not hidden.')
    expect(cardIds()).toEqual(['trial-NCT00000001', 'trial-NCT00000002', 'trial-NCT00000003'])
  })

  it('shows one heading when nothing likely rules any trial out', () => {
    show(trials(3, 0))

    expect(screen.getByRole('region', { name: 'Nothing likely rules you out (3)' })).toBeVisible()
    expect(screen.queryByRole('region', { name: /something likely rules you out/i })).toBeNull()
  })

  // A trial the search did not finish checking may still have a likely fail among the rules
  // left, and an unsplittable trial was never checked: neither can claim "nothing".
  it('keeps trials with rules not checked yet, or not readable, out of "nothing likely"', () => {
    show([
      trial(1),
      { ...trial(2), counts: { ...trial(2).counts, not_checked: 4 } },
      { ...trial(3), eligibility: 'unsplittable' },
      trial(4, 1),
    ])

    const clear = screen.getByRole('region', { name: 'Nothing likely rules you out (1)' })
    const partly = screen.getByRole('region', { name: 'Not fully checked (2)' })
    expect(
      within(clear)
        .getAllByRole('article')
        .map((a) => a.id),
    ).toEqual(['trial-NCT00000001'])
    expect(
      within(partly)
        .getAllByRole('article')
        .map((a) => a.id),
    ).toEqual(['trial-NCT00000002', 'trial-NCT00000003'])
    // Says what the search found, so a card that later finds a likely fail does not
    // contradict it.
    expect(partly).toHaveTextContent(
      'The search found nothing that likely rules you out, but it did not check every rule of these trials. Opening a trial checks the rest.',
    )
    expect(cardIds()).toEqual([
      'trial-NCT00000001',
      'trial-NCT00000002',
      'trial-NCT00000003',
      'trial-NCT00000004',
    ])
  })

  it('shows ten trials at a time, and moves focus to the first new one', () => {
    show(trials(20, 5))

    expect(screen.getAllByRole('article')).toHaveLength(10)
    // The trials something likely rules out come after the first page, not dropped.
    expect(screen.queryByRole('region', { name: /something likely rules you out/i })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Show 10 more (15 left)' }))
    expect(screen.getAllByRole('article')).toHaveLength(20)
    expect(document.activeElement).toBe(screen.getAllByRole('article')[10])

    fireEvent.click(screen.getByRole('button', { name: 'Show 5 more' }))
    expect(screen.getAllByRole('article')).toHaveLength(25)
    expect(screen.getByRole('region', { name: 'Something likely rules you out (5)' })).toBeVisible()
    expect(screen.queryByRole('button', { name: /^show/i })).toBeNull()
  })
})
