/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type {
  Profile,
  SearchResponse,
  TrialResult,
  TrialVerdictsResponse,
} from '@trialscout/contract'
import { fireEvent, render, screen } from '@testing-library/react'
import axe from 'axe-core'
import { describe, expect, it } from 'vitest'
import type { SearchOutcome, TrialOutcome } from './api.ts'
import { App } from './App.tsx'
import { DoctorSheet } from './DoctorSheet.tsx'
import { Root } from './Root.tsx'

// WCAG AA checks: axe on every page state, and the colour tokens' contrast worked out from
// index.css (jsdom has no layout, so axe cannot measure contrast itself).

async function violations(): Promise<string[]> {
  const result = await axe.run(document.body, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    rules: { 'color-contrast': { enabled: false } },
  })
  return result.violations.map(
    (v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`,
  )
}

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
  sexLimit: null,
  counts: { likely_meets: 1, likely_fails: 1, ask_your_doctor: 1, not_checked: 1 },
}

const VERDICTS: TrialVerdictsResponse = {
  ...TRIAL,
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
      kind: 'inclusion',
      text: 'ECOG performance status 0-1',
      group: null,
      verdict: 'ask_your_doctor',
      confidence: 0.4,
    },
    {
      kind: 'exclusion',
      text: 'Prior treatment with trastuzumab',
      group: null,
      verdict: 'likely_fails',
      confidence: 0.93,
    },
    {
      kind: 'exclusion',
      text: 'Active hepatitis B',
      group: null,
      verdict: 'not_checked',
      confidence: null,
    },
    {
      kind: 'inclusion',
      text: 'Melanoma of the skin',
      group: 'Cohort B',
      verdict: 'not_applicable',
      confidence: 0.9,
    },
  ],
  rawCriteria: null,
  checked: { questions: 5, requests: 2, cacheHits: 0, model: 'jev-1.13.0' },
  dataAsOf: Date.UTC(2026, 8, 26),
}

function response(source: SearchResponse['source'] = 'live'): SearchResponse {
  return {
    location: { city: 'Mumbai', countryCode: 'IN' },
    results: [TRIAL, { ...TRIAL, nctId: 'NCT00000002', eligibility: 'unsplittable' }],
    empty: null,
    checked: { questions: 40, requests: 4, cacheHits: 0, model: 'jev-1.13.0' },
    source,
    dataAsOf: Date.UTC(2026, 8, 26),
    listed: { total: 2, read: 2 },
  }
}

function renderApp(outcome: SearchOutcome, trial: TrialOutcome = { kind: 'unavailable' }): void {
  sessionStorage.setItem('trialscout.profile', JSON.stringify(PROFILE))
  render(<App search={async () => outcome} checkTrial={async () => trial} />)
}

async function search(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: 'Find trials' }))
  // The results heading; the form's sections have headings of their own.
  await screen.findByRole('heading', { level: 2, name: /trials/i })
}

describe('axe (WCAG 2.2 A and AA)', () => {
  it('finds nothing on the empty search page', async () => {
    render(<Root pathname="/" />)
    expect(await violations()).toEqual([])
  })

  it('finds nothing when the form shows its errors', async () => {
    render(<Root pathname="/" />)
    fireEvent.click(screen.getByRole('button', { name: 'Find trials' }))
    expect(document.querySelector('[aria-invalid="true"]')).not.toBeNull()
    expect(await violations()).toEqual([])
  })

  it('finds nothing on the results, with a trial opened rule by rule', async () => {
    renderApp({ kind: 'results', response: response() }, { kind: 'verdicts', response: VERDICTS })
    await search()
    fireEvent.click(screen.getAllByRole('button', { name: 'Check each rule' })[0] as HTMLElement)
    await screen.findByText('ECOG performance status 0-1')
    expect(await violations()).toEqual([])
  })

  it('finds nothing on an opened trial filtered to one verdict', async () => {
    renderApp({ kind: 'results', response: response() }, { kind: 'verdicts', response: VERDICTS })
    await search()
    fireEvent.click(screen.getAllByRole('button', { name: 'Check each rule' })[0] as HTMLElement)
    fireEvent.click(await screen.findByRole('button', { name: 'Ask your doctor (1)' }))
    expect(screen.getByText('Showing 1 of 4 rules.')).toBeInTheDocument()
    expect(await violations()).toEqual([])
  })

  it('finds nothing on results served from the saved copy, or with no trials', async () => {
    renderApp({ kind: 'results', response: response('saved') })
    await search()
    expect(await violations()).toEqual([])
  })

  it('finds nothing on a second page of results, split by likely fails', async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      ...TRIAL,
      nctId: `NCT${String(i + 1).padStart(8, '0')}`,
      counts: { ...TRIAL.counts, likely_fails: i < 9 ? 0 : 1 },
    }))
    renderApp({ kind: 'results', response: { ...response(), results: many } })
    await search()
    fireEvent.click(screen.getByRole('button', { name: 'Show 2 more' }))
    expect(screen.getAllByRole('article')).toHaveLength(12)
    expect(await violations()).toEqual([])
  })

  it('finds nothing on the about page', async () => {
    render(<Root pathname="/about" />)
    expect(await violations()).toEqual([])
  })

  it('finds nothing on the printed doctor sheet', async () => {
    render(
      <DoctorSheet
        trial={VERDICTS}
        profile={PROFILE}
        site="Tata Memorial Hospital, Mumbai · 8 km"
      />,
    )
    expect(await violations()).toEqual([])
  })
})

// Colour tokens from index.css: the light set in :root, the dark set in the
// prefers-color-scheme block.
// Read from disk: Vitest does not load CSS, so an import would come back empty.
const CSS = readFileSync(resolve(import.meta.dirname, 'index.css'), 'utf8')

function tokens(scheme: 'light' | 'dark'): Map<string, string> {
  const dark = CSS.indexOf('@media (prefers-color-scheme: dark)')
  const block = scheme === 'light' ? CSS.slice(0, dark) : CSS.slice(dark)
  const found = new Map<string, string>()
  for (const [, name, value] of block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\b/gi)) {
    if (name !== undefined && value !== undefined && !found.has(name)) found.set(name, value)
  }
  return found
}

function luminance(hex: string): number {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) => {
    const v = Number.parseInt(hex.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

// Text on the page, on cards and on the summary bar: 4.5:1. Field and button borders, and
// focus rings: 3:1.
const TEXT = ['fg', 'muted', 'accent', 'error', 'meets', 'fails', 'ask', 'unchecked']
const GROUNDS = ['bg', 'surface', 'surface-2']
const PAIRS: [string, string, number][] = [
  ...TEXT.flatMap((fg) => GROUNDS.map((bg): [string, string, number] => [fg, bg, 4.5])),
  ['caution-fg', 'caution-bg', 4.5],
  ['bg', 'accent', 4.5],
  // A filled button, and a selected filter chip.
  ['on-accent', 'accent', 4.5],
  ['accent', 'accent-soft', 4.5],
  ['fg', 'accent-soft', 4.5],
  // Verdict pills: the verdict colour on its own soft ground.
  ['meets', 'meets-bg', 4.5],
  ['ask', 'ask-bg', 4.5],
  ['fails', 'fails-bg', 4.5],
  ...GROUNDS.map((bg): [string, string, number] => ['control', bg, 3]),
  ...GROUNDS.map((bg): [string, string, number] => ['accent', bg, 3]),
]

describe.each(['light', 'dark'] as const)('colour contrast, %s scheme', (scheme) => {
  const colours = tokens(scheme)

  it.each(PAIRS)('--%s on --%s reaches %s:1', (fg, bg, minimum) => {
    const a = colours.get(fg)
    const b = colours.get(bg)
    expect(a, `--${fg}`).toBeDefined()
    expect(b, `--${bg}`).toBeDefined()
    expect(contrast(a ?? '', b ?? '')).toBeGreaterThanOrEqual(minimum)
  })
})
