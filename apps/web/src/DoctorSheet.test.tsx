import type { CriterionVerdict, Profile, TrialVerdictsResponse } from '@trialscout/contract'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DISCLAIMER } from './DemoCaution.tsx'
import { DoctorSheet } from './DoctorSheet.tsx'

const PROFILE: Profile = {
  cancerType: 'breast cancer',
  stage: 'II',
  age: 47,
  sex: 'female',
  country: 'India',
  city: 'Mumbai',
  maxDistanceKm: 100,
  notes: 'Had surgery in 2025.',
}

function criterion(
  kind: CriterionVerdict['kind'],
  text: string,
  verdict: CriterionVerdict['verdict'],
): CriterionVerdict {
  return { kind, text, group: null, verdict, confidence: 0.9 }
}

function trial(overrides: Partial<TrialVerdictsResponse> = {}): TrialVerdictsResponse {
  return {
    nctId: 'NCT00000001',
    title: 'A study of drug X',
    phases: ['PHASE2'],
    sponsor: 'Sponsor',
    url: 'https://clinicaltrials.gov/study/NCT00000001',
    eligibility: 'split',
    criteria: [
      criterion('inclusion', 'Histologically confirmed breast cancer', 'likely_meets'),
      criterion('inclusion', 'ECOG performance status 0-1', 'ask_your_doctor'),
      criterion('exclusion', 'Prior treatment with trastuzumab', 'likely_fails'),
      criterion('exclusion', 'Active hepatitis B', 'not_checked'),
      criterion('inclusion', 'Melanoma of the skin', 'not_applicable'),
    ],
    rawCriteria: null,
    counts: { likely_meets: 1, likely_fails: 1, ask_your_doctor: 1, not_checked: 1 },
    checked: { questions: 5, requests: 2, cacheHits: 0, model: 'jev-1.13.0' },
    dataAsOf: Date.UTC(2026, 8, 26),
    ...overrides,
  }
}

function sheet(overrides: Partial<TrialVerdictsResponse> = {}): HTMLElement {
  render(
    <DoctorSheet trial={trial(overrides)} profile={PROFILE} site="Tata Memorial, Mumbai · 8 km" />,
  )
  return screen.getByRole('document', { name: 'Questions for your doctor' })
}

describe('DoctorSheet', () => {
  it('carries the exact disclaimer, the trial ID and the official link written out', () => {
    const page = within(sheet())

    expect(page.getByText(DISCLAIMER)).toBeInTheDocument()
    expect(page.getByText('NCT00000001')).toBeInTheDocument()
    expect(page.getByText('https://clinicaltrials.gov/study/NCT00000001')).toBeInTheDocument()
    expect(page.getByText('Tata Memorial, Mumbai · 8 km', { exact: false })).toBeInTheDocument()
  })

  it('repeats the disclaimer at the top of every printed page', () => {
    const root = sheet()

    // Browsers repeat a table's header group on each printed page.
    expect(root.querySelector('thead')).toHaveTextContent(DISCLAIMER)
  })

  it('lists rules to ask about, each quoted with its plain question', () => {
    sheet()
    const ask = within(screen.getByRole('list', { name: 'Rules to ask about' }))

    expect(ask.getAllByRole('listitem')).toHaveLength(2)
    expect(ask.getByText('ECOG performance status 0-1')).toBeInTheDocument()
    expect(ask.getByText(/daily activities/)).toBeInTheDocument()
    expect(ask.getByText('Active hepatitis B')).toBeInTheDocument()
  })

  it('asks the doctor to confirm each likely fail', () => {
    sheet()
    const fails = within(screen.getByRole('list', { name: 'Rules that may keep me out' }))

    expect(fails.getByText('Prior treatment with trastuzumab')).toBeInTheDocument()
    expect(fails.getByText(/keeps me out\. Is that right\?/)).toBeInTheDocument()
  })

  it('summarises the rules it found likely met, and what the patient entered', () => {
    const page = within(sheet())

    expect(page.getByText(/1 rule looked likely to be met/)).toBeInTheDocument()
    expect(page.queryByText('Histologically confirmed breast cancer')).toBeNull()
    expect(page.getByText(/breast cancer, stage II, age 47, female/)).toBeInTheDocument()
    expect(page.getByText(/Had surgery in 2025\./)).toBeInTheDocument()
  })

  it('prints rules it could not split as written', () => {
    const raw = 'Adults with breast cancer who are well enough to take part.'
    const page = within(
      sheet({
        eligibility: 'unsplittable',
        criteria: [],
        rawCriteria: raw,
        counts: { likely_meets: 0, likely_fails: 0, ask_your_doctor: 1, not_checked: 0 },
      }),
    )

    expect(page.getByText(raw)).toBeInTheDocument()
    expect(page.getByText(/go through them with me/i)).toBeInTheDocument()
  })
})
