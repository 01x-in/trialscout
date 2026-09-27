import type { Profile, TrialResult, TrialVerdictsResponse } from '@trialscout/contract'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TrialCard } from './TrialCard.tsx'

// The trial card (F4): a plain title, small tags, the nearest site, the verdict counts with a
// bar that is never the only signal, and the official page as its own link.

const PROFILE: Profile = {
  cancerType: 'breast cancer',
  stage: 'II',
  age: 47,
  sex: 'female',
  country: 'India',
  city: 'Mumbai',
  maxDistanceKm: 100,
}

const TRIAL: TrialResult = {
  nctId: 'NCT00000001',
  title: 'A study of drug X',
  phases: ['PHASE2'],
  sponsor: 'Tata Memorial Hospital',
  url: 'https://clinicaltrials.gov/study/NCT00000001',
  nearestSite: {
    facility: 'Tata Memorial Hospital',
    city: 'Mumbai',
    country: 'India',
    distanceKm: 8,
  },
  eligibility: 'split',
  counts: { likely_meets: 3, likely_fails: 1, ask_your_doctor: 6, not_checked: 0 },
}

function card(trial: TrialResult = TRIAL): HTMLElement {
  render(
    <TrialCard
      trial={trial}
      profile={PROFILE}
      checkTrial={async () => ({ kind: 'unavailable' })}
    />,
  )
  return screen.getByRole('article', { name: trial.title })
}

describe('a trial card', () => {
  it('titles the trial in plain text, not as a link', () => {
    const heading = within(card()).getByRole('heading', { level: 3, name: 'A study of drug X' })

    expect(heading.querySelector('a')).toBeNull()
  })

  it('tags the phase and the trial ID, and names the sponsor and nearest site', () => {
    const tags = within(card()).getByRole('list', { name: 'About this trial' })

    expect(
      within(tags)
        .getAllByRole('listitem')
        .map((t) => t.textContent),
    ).toEqual(['Phase 2', 'NCT00000001', 'Tata Memorial Hospital'])
    expect(screen.getByText('Tata Memorial Hospital, Mumbai · 8 km')).toBeInTheDocument()
  })

  it('links to the official page on its own, naming the trial for screen readers', () => {
    const link = within(card()).getByRole('link', {
      name: 'Official page for A study of drug X (opens in a new tab)',
    })

    expect(link).toHaveAttribute('href', 'https://clinicaltrials.gov/study/NCT00000001')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noreferrer')
  })

  it('draws a bar in proportion to the counts, hidden from screen readers', () => {
    const counts = within(card()).getByRole('list', {
      name: "How your profile compares with this trial's rules",
    })
    const bar = document.querySelector('.verdict-bar')

    expect(
      within(counts)
        .getAllByRole('listitem')
        .map((c) => c.textContent),
    ).toEqual(['✓3 likely meets', '✕1 likely fails', '?6 ask your doctor'])
    expect(bar).toHaveAttribute('aria-hidden', 'true')
    expect(
      [...(bar?.children ?? [])].map((s) => [s.className, (s as HTMLElement).style.flexGrow]),
    ).toEqual([
      ['verdict-bar-likely_meets', '3'],
      ['verdict-bar-likely_fails', '1'],
      ['verdict-bar-ask_your_doctor', '6'],
    ])
  })

  it('draws no bar for a trial whose rules could not be split', () => {
    card({ ...TRIAL, eligibility: 'unsplittable' })

    expect(document.querySelector('.verdict-bar')).toBeNull()
    expect(screen.getByText(/could not turn this trial's rules into a checklist/)).toBeVisible()
  })

  it('updates its counts once every rule is checked, so a new likely fail shows', async () => {
    const searched: TrialResult = {
      ...TRIAL,
      counts: { likely_meets: 3, likely_fails: 0, ask_your_doctor: 6, not_checked: 2 },
    }
    const checked: TrialVerdictsResponse = {
      ...TRIAL,
      criteria: [],
      rawCriteria: null,
      counts: { likely_meets: 4, likely_fails: 1, ask_your_doctor: 6, not_checked: 0 },
      checked: { questions: 2, requests: 1, cacheHits: 0, model: 'jev-1.13.0' },
      dataAsOf: Date.UTC(2026, 8, 27),
    }
    render(
      <TrialCard
        trial={searched}
        profile={PROFILE}
        checkTrial={async () => ({ kind: 'verdicts', response: checked })}
      />,
    )
    const counts = (): (string | null)[] =>
      within(
        screen.getByRole('list', { name: "How your profile compares with this trial's rules" }),
      )
        .getAllByRole('listitem')
        .map((c) => c.textContent)

    expect(counts()).toEqual(['✓3 likely meets', '?6 ask your doctor', '…2 not checked yet'])

    fireEvent.click(screen.getByRole('button', { name: 'Check each rule' }))

    expect(await screen.findByText('1 likely fails')).toBeVisible()
    expect(counts()).toEqual(['✓4 likely meets', '✕1 likely fails', '?6 ask your doctor'])
  })
})
