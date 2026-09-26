import type {
  Profile,
  SearchResponse,
  TrialResult,
  TrialVerdictsResponse,
} from '@trialscout/contract'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { SearchOutcome, TrialOutcome } from './api.ts'
import { App } from './App.tsx'

const DISCLAIMER =
  'Demo project. Not medical advice. AI picks these quotes from ClinicalTrials.gov and no clinicians have verified them.'

const PROFILE: Profile = {
  cancerType: 'breast cancer',
  stage: 'II',
  age: 47,
  sex: 'female',
  country: 'India',
  city: 'Mumbai',
  maxDistanceKm: 100,
}

function result(nctId: string, overrides: Partial<TrialResult> = {}): TrialResult {
  return {
    nctId,
    title: `A study of drug ${nctId}`,
    phases: ['PHASE2'],
    sponsor: 'Tata Memorial Hospital',
    url: `https://clinicaltrials.gov/study/${nctId}`,
    nearestSite: {
      facility: 'Tata Memorial Hospital',
      city: 'Mumbai',
      country: 'India',
      distanceKm: 8,
    },
    eligibility: 'split',
    counts: { likely_meets: 9, likely_fails: 0, ask_your_doctor: 4, not_checked: 0 },
    ...overrides,
  }
}

function response(results: TrialResult[], empty: SearchResponse['empty'] = null): SearchResponse {
  return {
    location: { city: 'Mumbai', countryCode: 'IN' },
    results,
    empty,
    checked: { questions: 40, requests: 4, cacheHits: 0, model: 'jev-1.13.0' },
    dataAsOf: Date.UTC(2026, 8, 26),
  }
}

function fill(label: RegExp, value: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

function fillProfile(): void {
  fill(/cancer type/i, PROFILE.cancerType)
  fill(/^stage/i, PROFILE.stage)
  fill(/^age/i, String(PROFILE.age))
  fill(/^sex/i, PROFILE.sex)
  fill(/country/i, PROFILE.country)
  fill(/city/i, PROFILE.city)
  fill(/how far/i, String(PROFILE.maxDistanceKm))
}

function verdicts(nctId: string): TrialVerdictsResponse {
  return {
    nctId,
    title: `A study of drug ${nctId}`,
    phases: ['PHASE2'],
    sponsor: 'Tata Memorial Hospital',
    url: `https://clinicaltrials.gov/study/${nctId}`,
    eligibility: 'split',
    criteria: [
      {
        kind: 'inclusion',
        text: 'Histologically confirmed breast cancer',
        group: null,
        verdict: 'likely_meets',
        confidence: 0.95,
      },
      {
        kind: 'exclusion',
        text: 'Prior treatment with trastuzumab',
        group: null,
        verdict: 'ask_your_doctor',
        confidence: 0.9,
      },
    ],
    rawCriteria: null,
    counts: { likely_meets: 1, likely_fails: 0, ask_your_doctor: 1, not_checked: 0 },
    checked: { questions: 2, requests: 2, cacheHits: 0, model: 'jev-1.13.0' },
    dataAsOf: Date.UTC(2026, 8, 26),
  }
}

type Checked = { nctId: string; profile: Profile }

function renderWith(
  outcome: SearchOutcome,
  seen: Profile[] = [],
  trialOutcome: TrialOutcome = { kind: 'unavailable' },
  checked: Checked[] = [],
): void {
  render(
    <App
      search={async (profile) => {
        seen.push(profile)
        return outcome
      }}
      checkTrial={async (nctId, profile) => {
        checked.push({ nctId, profile })
        return trialOutcome
      }}
    />,
  )
}

async function searchAndOpen(
  trialOutcome: TrialOutcome,
  checked: Checked[] = [],
): Promise<HTMLElement> {
  renderWith(
    { kind: 'results', response: response([result('NCT00000001')]) },
    [],
    trialOutcome,
    checked,
  )
  fillProfile()
  fireEvent.click(screen.getByRole('button', { name: 'Find trials' }))
  const [card] = await screen.findAllByRole('article')
  if (card === undefined) throw new Error('Expected a trial card')
  fireEvent.click(within(card).getByRole('button', { name: /check each rule/i }))
  return card
}

describe('App', () => {
  it('shows the exact disclaimer strip, with nothing to dismiss it', () => {
    renderWith({ kind: 'unavailable' })

    const strip = screen.getByRole('note', { name: 'Caution' })
    expect(strip).toHaveTextContent(DISCLAIMER)
    expect(strip.querySelector('button')).toBeNull()
  })

  it('names each missing field and does not search', () => {
    const seen: Profile[] = []
    renderWith({ kind: 'unavailable' }, seen)
    fireEvent.click(screen.getByRole('button', { name: 'Find trials' }))

    expect(screen.getByText('Enter your cancer type.')).toBeInTheDocument()
    expect(screen.getByText('Enter your age in whole years.')).toBeInTheDocument()
    expect(seen).toEqual([])
  })

  it('searches with the profile, keeping it in this browser tab only', async () => {
    const seen: Profile[] = []
    renderWith({ kind: 'results', response: response([result('NCT00000001')]) }, seen)
    fillProfile()
    fireEvent.click(screen.getByRole('button', { name: 'Find trials' }))

    await screen.findByRole('heading', { name: /trials worth discussing with your doctor/i })
    expect(seen).toEqual([PROFILE])
    expect(JSON.parse(sessionStorage.getItem('trialscout.profile') ?? 'null')).toEqual(PROFILE)
  })

  it('shows each trial with phase, sponsor, nearest site, verdict counts and the official link', async () => {
    renderWith({
      kind: 'results',
      response: response([
        result('NCT00000001'),
        result('NCT00000002', {
          phases: [],
          nearestSite: null,
          counts: { likely_meets: 3, likely_fails: 1, ask_your_doctor: 2, not_checked: 5 },
        }),
      ]),
    })
    fillProfile()
    fireEvent.click(screen.getByRole('button', { name: 'Find trials' }))

    const cards = await screen.findAllByRole('article')
    expect(cards).toHaveLength(2)
    const first = within(cards[0] as HTMLElement)
    expect(first.getByRole('link', { name: /A study of drug NCT00000001/ })).toHaveAttribute(
      'href',
      'https://clinicaltrials.gov/study/NCT00000001',
    )
    expect(first.getByText('Phase 2')).toBeInTheDocument()
    expect(first.getByText('Tata Memorial Hospital, Mumbai · 8 km')).toBeInTheDocument()
    expect(first.getByText('9 likely meets')).toBeInTheDocument()
    expect(first.getByText('4 ask your doctor')).toBeInTheDocument()
    const second = within(cards[1] as HTMLElement)
    expect(second.getByText('1 likely fails')).toBeInTheDocument()
    expect(second.getByText('5 not checked yet')).toBeInTheDocument()
    expect(second.getByText('Distance not known')).toBeInTheDocument()
  })

  it('never promises eligibility in its wording', async () => {
    renderWith({ kind: 'results', response: response([result('NCT00000001')]) })
    fillProfile()
    fireEvent.click(screen.getByRole('button', { name: 'Find trials' }))
    await screen.findAllByRole('article')

    // Trial titles are quoted from the source; everything else is ours.
    const ours = document.body.textContent?.replace(/A study of drug NCT\d+/g, '') ?? ''
    expect(ours).not.toMatch(/\b(eligible|eligibility|qualify|qualifies|match|matches)\b/i)
  })

  it('explains an empty result and suggests a larger distance', async () => {
    renderWith({
      kind: 'results',
      response: response([], { reason: 'none_nearby', relax: 'distance' }),
    })
    fillProfile()
    fireEvent.click(screen.getByRole('button', { name: 'Find trials' }))

    expect(await screen.findByText(/no recruiting trials/i)).toHaveTextContent(
      'within 100 km of Mumbai',
    )
    expect(screen.getByText(/try a larger travel distance/i)).toBeInTheDocument()
  })

  it('shows a calm try-again-later message when searches are limited', async () => {
    renderWith({ kind: 'rate_limited', retryAfterSeconds: 40 })
    fillProfile()
    fireEvent.click(screen.getByRole('button', { name: 'Find trials' }))

    expect(await screen.findByText(/searched a lot in a short time/i)).toBeInTheDocument()
  })

  it('shows a calm message when trials cannot be checked', async () => {
    renderWith({ kind: 'unavailable' })
    fillProfile()
    fireEvent.click(screen.getByRole('button', { name: 'Find trials' }))

    expect(await screen.findByText(/could not check trials right now/i)).toBeInTheDocument()
  })

  it('points to the city field when the city is not found', async () => {
    renderWith({ kind: 'unknown_place', field: 'city', message: 'We could not find that city.' })
    fillProfile()
    fireEvent.click(screen.getByRole('button', { name: 'Find trials' }))

    expect(await screen.findByText('We could not find that city.')).toBeInTheDocument()
    expect(screen.getByLabelText(/city/i)).toHaveAttribute('aria-invalid', 'true')
  })

  it('checks each rule of a trial when opened, with the profile from this tab', async () => {
    const checked: Checked[] = []
    const card = await searchAndOpen(
      { kind: 'verdicts', response: verdicts('NCT00000001') },
      checked,
    )

    expect(
      await within(card).findByText('Histologically confirmed breast cancer'),
    ).toBeInTheDocument()
    expect(within(card).getByText('Prior treatment with trastuzumab')).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: /hide the rules/i })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(checked).toEqual([{ nctId: 'NCT00000001', profile: PROFILE }])
  })

  it('hides the rules again without checking twice', async () => {
    const checked: Checked[] = []
    const card = await searchAndOpen(
      { kind: 'verdicts', response: verdicts('NCT00000001') },
      checked,
    )
    await within(card).findByText('Histologically confirmed breast cancer')

    fireEvent.click(within(card).getByRole('button', { name: /hide the rules/i }))
    expect(within(card).queryByText('Histologically confirmed breast cancer')).toBeNull()
    fireEvent.click(within(card).getByRole('button', { name: /check each rule/i }))
    expect(within(card).getByText('Histologically confirmed breast cancer')).toBeInTheDocument()
    expect(checked).toHaveLength(1)
  })

  it('shows a calm message when checking a trial is limited', async () => {
    const card = await searchAndOpen({ kind: 'rate_limited', retryAfterSeconds: 30 })

    expect(
      await within(card).findByText(/checked a lot of trials in a short time/i),
    ).toBeInTheDocument()
  })

  it('shows a calm message when a trial cannot be checked', async () => {
    const card = await searchAndOpen({ kind: 'unavailable' })

    expect(await within(card).findByText(/could not check this trial/i)).toBeInTheDocument()
  })
})
