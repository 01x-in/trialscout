import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DISCLAIMER } from './DemoCaution.tsx'
import { Root } from './Root.tsx'

describe('About this demo', () => {
  it('is served at /about, under the exact disclaimer strip', () => {
    render(<Root pathname="/about" />)

    expect(screen.getByRole('heading', { level: 1, name: 'About this demo' })).toBeInTheDocument()
    expect(screen.getByRole('note', { name: 'Caution' }).textContent).toBe(DISCLAIMER)
    expect(document.title).toBe('About this demo · TrialScout')
  })

  it('explains how the check works, what Jev is, its limits and why no clinician checked it', () => {
    render(<Root pathname="/about/" />)

    for (const name of [
      'How the check works',
      'What Jev is',
      'What it cannot do',
      'Why no doctor has checked these results',
      'Your answers stay with you',
      'Where the data comes from',
    ]) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument()
    }
    expect(screen.getByText(/likely meets, likely fails or ask your doctor/i)).toBeInTheDocument()
  })

  it('credits GeoNames under CC BY 4.0 and names ClinicalTrials.gov', () => {
    render(<Root pathname="/about" />)
    const credits = within(screen.getByRole('region', { name: 'Where the data comes from' }))

    expect(credits.getByRole('link', { name: 'GeoNames' })).toHaveAttribute(
      'href',
      'https://www.geonames.org/',
    )
    expect(credits.getByRole('link', { name: 'CC BY 4.0' })).toHaveAttribute(
      'href',
      'https://creativecommons.org/licenses/by/4.0/',
    )
    expect(credits.getByRole('link', { name: 'ClinicalTrials.gov' })).toHaveAttribute(
      'href',
      'https://clinicaltrials.gov/',
    )
  })

  it('says the answers are not stored, and names the two things kept for a short time', () => {
    render(<Root pathname="/about" />)
    const privacy = screen.getByRole('region', { name: 'Your answers stay with you' })

    expect(privacy).toHaveTextContent('We do not store them, log them or use them for tracking.')
    expect(privacy).toHaveTextContent(
      "Jev's answers for each trial, for up to 7 days, so the same check is not paid for twice. They are filed under a scrambled code, with nothing that says who asked.",
    )
    expect(privacy).toHaveTextContent(
      'Your internet address and the times you searched or checked a trial, for up to a day, to limit how often one connection can search.',
    )
    expect(privacy).toHaveTextContent(
      'ClinicalTrials.gov and TypeSafe AI, who make Jev, keep what they get under their own terms.',
    )
  })

  it('never promises a place on a trial in its wording', () => {
    render(<Root pathname="/about" />)

    expect(document.body.textContent).not.toMatch(
      /\b(eligible|eligibility|qualify|qualifies|match|matches|matching)\b/i,
    )
  })

  it('links back to the search, and the search links to it', () => {
    const { unmount } = render(<Root pathname="/about" />)
    expect(screen.getByRole('link', { name: 'Back to the trial search' })).toHaveAttribute(
      'href',
      '/search',
    )
    unmount()

    render(<Root pathname="/search" />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Check trials near you')
    expect(screen.getByRole('link', { name: 'About this demo' })).toHaveAttribute('href', '/about')
    expect(document.title).toBe('Check trials · TrialScout')
  })
})
