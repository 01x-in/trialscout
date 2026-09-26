import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from './App.tsx'

const DISCLAIMER =
  'Demo project. Not medical advice. AI picks these quotes from ClinicalTrials.gov and no clinicians have verified them.'

function fill(label: RegExp, value: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

describe('App', () => {
  it('shows the exact disclaimer strip, with nothing to dismiss it', () => {
    render(<App />)

    const strip = screen.getByRole('note', { name: 'Caution' })
    expect(strip).toHaveTextContent(DISCLAIMER)
    expect(strip.querySelector('button')).toBeNull()
  })

  it('names each missing field when an empty form is sent', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }))

    expect(screen.getByText('Enter your cancer type.')).toBeInTheDocument()
    expect(screen.getByText('Enter your age in whole years.')).toBeInTheDocument()
    expect(sessionStorage.getItem('trialscout.profile')).toBeNull()
  })

  it('keeps a valid profile in this browser tab only', () => {
    render(<App />)
    fill(/cancer type/i, 'breast cancer')
    fill(/^stage/i, 'II')
    fill(/^age/i, '47')
    fill(/^sex/i, 'female')
    fill(/country/i, 'India')
    fill(/city/i, 'Mumbai')
    fill(/how far/i, '100')
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }))

    expect(JSON.parse(sessionStorage.getItem('trialscout.profile') ?? 'null')).toEqual({
      cancerType: 'breast cancer',
      stage: 'II',
      age: 47,
      sex: 'female',
      country: 'India',
      city: 'Mumbai',
      maxDistanceKm: 100,
    })
    expect(screen.getByRole('status')).toHaveTextContent('Profile saved in this browser tab.')
  })
})
