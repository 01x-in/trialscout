import { describe, expect, it } from 'vitest'
import { ageInYears } from '../src/trial.ts'

describe('ageInYears', () => {
  it.each([
    ['18 Years', 18],
    ['130 Years', 130],
    ['1 Year', 1],
    ['6 Months', 0.5],
    ['1 Month', 1 / 12],
    ['52 Weeks', 52 / 52.1775],
    ['30 Days', 30 / 365.25],
    [' 65 years ', 65],
  ])('reads %j as %d', (text, years) => {
    expect(ageInYears(text)).toBeCloseTo(years, 6)
  })

  it.each([[undefined], [''], ['N/A'], ['eighteen'], ['18'], ['-5 Years']])(
    'reads %j as no limit',
    (text) => {
      expect(ageInYears(text)).toBeNull()
    },
  )
})
