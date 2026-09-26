import type { CriterionVerdict, TrialVerdictsResponse } from '@trialscout/contract'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Checklist } from './Checklist.tsx'

function criterion(
  kind: CriterionVerdict['kind'],
  text: string,
  verdict: CriterionVerdict['verdict'],
  group: string | null = null,
): CriterionVerdict {
  return { kind, text, group, verdict, confidence: verdict === 'not_checked' ? null : 0.9 }
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
      criterion('inclusion', 'Histologically confirmed NSCLC', 'likely_meets'),
      criterion('inclusion', 'ECOG performance status 0-1', 'ask_your_doctor'),
      criterion('exclusion', 'Prior treatment with osimertinib', 'likely_fails'),
      criterion('exclusion', 'Active hepatitis B', 'not_checked'),
      criterion('inclusion', 'Melanoma of the skin', 'not_applicable', 'Cohort B'),
    ],
    rawCriteria: null,
    counts: { likely_meets: 1, likely_fails: 1, ask_your_doctor: 1, not_checked: 1 },
    checked: { questions: 5, requests: 2, cacheHits: 0, model: 'jev-1.13.0' },
    dataAsOf: Date.UTC(2026, 8, 26),
    ...overrides,
  }
}

function item(text: string): HTMLElement {
  const found = screen.getByText(text).closest('li')
  if (found === null) throw new Error(`No list item for ${text}`)
  return found
}

describe('Checklist', () => {
  it('shows every verdict with an icon and a label next to the verbatim rule', () => {
    render(<Checklist trial={trial()} />)

    const expected: [string, string][] = [
      ['Histologically confirmed NSCLC', 'likely meets'],
      ['ECOG performance status 0-1', 'ask your doctor'],
      ['Prior treatment with osimertinib', 'likely fails'],
      ['Active hepatitis B', 'not checked yet'],
    ]
    for (const [text, label] of expected) {
      const li = within(item(text))
      expect(li.getByText(label)).toBeInTheDocument()
      // The icon repeats the label for sighted readers; screen readers hear the label once.
      expect(item(text).querySelector('[aria-hidden="true"]')?.textContent).not.toBe('')
      expect(li.getByText(text).tagName).toBe('BLOCKQUOTE')
    }
  })

  it('lists the rules to take part apart from the rules that keep people out', () => {
    render(<Checklist trial={trial()} />)

    const include = screen.getByRole('list', { name: 'To take part, you need' })
    const exclude = screen.getByRole('list', { name: 'You cannot take part if' })
    expect(within(include).getAllByRole('listitem')).toHaveLength(2)
    expect(within(exclude).getAllByRole('listitem')).toHaveLength(2)
  })

  it('sets rules for other groups of patients apart, with no verdict', () => {
    render(<Checklist trial={trial()} />)

    const other = screen.getByRole('list', { name: 'Rules for other groups of patients' })
    const li = within(other).getByRole('listitem')
    expect(li).toHaveTextContent('Melanoma of the skin')
    expect(li).toHaveTextContent('Cohort B')
    expect(li).not.toHaveTextContent(/likely|ask your doctor/)
  })

  it('shows rules it could not split as written, with "ask your doctor"', () => {
    const raw = 'Adults with lung cancer who are well enough to take part.'
    render(
      <Checklist
        trial={trial({
          eligibility: 'unsplittable',
          criteria: [],
          rawCriteria: raw,
          counts: { likely_meets: 0, likely_fails: 0, ask_your_doctor: 1, not_checked: 0 },
        })}
      />,
    )

    expect(screen.getByText(raw).tagName).toBe('BLOCKQUOTE')
    expect(screen.getByText(/ask your doctor/i)).toBeInTheDocument()
  })

  it('never promises eligibility in its own wording', () => {
    render(<Checklist trial={trial()} />)

    const quoted = trial().criteria.map((c) => c.text)
    let ours = document.body.textContent ?? ''
    for (const text of quoted) ours = ours.replace(text, '')
    expect(ours).not.toMatch(/\b(eligible|eligibility|qualify|qualifies|match|matches)\b/i)
  })
})
