/// <reference types="node" />
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DISCLAIMER } from './DemoCaution.tsx'
import { Root } from './Root.tsx'

// The landing page (/): what TrialScout does, the demo video, the three steps, the four
// promises, and a way in. Its words are in PLAN.md's GATE 2 list.

function renderLanding(): void {
  render(<Root pathname="/" />)
}

describe('the landing page', () => {
  it('opens with a short heading, one line about it, and a way in', () => {
    renderLanding()

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Which cancer trials are worth asking your doctor about?',
    )
    expect(screen.getByText(/^Tell us about the cancer in plain words\./)).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Try it now' }).length).toBeGreaterThanOrEqual(2)
  })

  it('sends every Try it now to the search', () => {
    renderLanding()

    for (const link of screen.getAllByRole('link', { name: 'Try it now' })) {
      expect(link).toHaveAttribute('href', '/search')
    }
  })

  it('keeps the exact disclaimer strip', () => {
    renderLanding()

    expect(screen.getByRole('note', { name: 'Caution' }).textContent).toBe(DISCLAIMER)
  })

  describe('the demo video', () => {
    it('is on our own site, with a poster and English captions, and never plays by itself', () => {
      renderLanding()
      const video = screen.getByLabelText('Demo video') as HTMLVideoElement
      const track = video.querySelector('track')

      expect(video.tagName).toBe('VIDEO')
      expect(video).toHaveAttribute('controls')
      expect(video).not.toHaveAttribute('autoplay')
      expect(video).toHaveAttribute('preload', 'metadata')
      expect(video.getAttribute('src')).toBe('/demo/trialscout-demo.mp4')
      expect(video.getAttribute('poster')).toBe('/demo/poster.jpg')
      expect(track?.getAttribute('kind')).toBe('captions')
      expect(track?.getAttribute('srclang')).toBe('en')
      expect(track?.getAttribute('src')).toBe('/demo/captions.vtt')
      expect(track).toHaveAttribute('default')
    })

    it('has its files in public/, and says the patient is made up', () => {
      renderLanding()

      for (const name of ['trialscout-demo.mp4', 'poster.jpg', 'captions.vtt']) {
        expect(existsSync(resolve(import.meta.dirname, '../public/demo', name))).toBe(true)
      }
      expect(screen.getByText('A two-minute demo with a made-up patient.')).toBeInTheDocument()
    })
  })

  it('shows the three steps', () => {
    renderLanding()
    const steps = within(screen.getByRole('list', { name: 'How it works' }))

    expect(steps.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Tell us about the cancer',
      'We check every rule of nearby recruiting trials',
      'Take your questions to your doctor',
    ])
  })

  it('makes four promises about being careful', () => {
    renderLanding()
    const section = screen.getByRole('region', { name: 'Built to be careful' })

    for (const name of [
      'Every answer quotes the trial',
      'It says "ask your doctor"',
      'Listed last, not hidden',
      'Nothing is stored',
    ]) {
      expect(within(section).getByRole('heading', { level: 3, name })).toBeInTheDocument()
    }
  })

  it('closes with the warning, and a link to About', () => {
    renderLanding()

    expect(
      screen.getByText('A demo, not medical advice. No doctor has checked its answers.'),
    ).toBeInTheDocument()
    const about = screen.getAllByRole('link', { name: 'About this demo' })
    for (const link of about) expect(link).toHaveAttribute('href', '/about')
    expect(about.length).toBeGreaterThanOrEqual(2)
  })

  it('never promises a place on a trial in its wording', () => {
    renderLanding()

    expect(document.body.textContent).not.toMatch(
      /\b(eligible|eligibility|qualify|qualifies|match|matches|matching)\b/i,
    )
  })
})
