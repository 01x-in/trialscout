import type { Profile } from '@trialscout/contract'
import { describe, expect, it } from 'vitest'
import { checkProfile, formToCandidate, loadProfile, saveProfile } from './profile.ts'

const profile: Profile = {
  cancerType: 'non-small cell lung cancer',
  stage: 'III',
  age: 58,
  sex: 'female',
  country: 'India',
  city: 'Pune',
  maxDistanceKm: 200,
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData()
  for (const [name, value] of Object.entries(fields)) data.set(name, value)
  return data
}

describe('checkProfile (Typia)', () => {
  it('accepts a valid profile', () => {
    expect(checkProfile(profile)).toEqual({ ok: true, profile })
  })

  it.each([
    ['a wrong type', { ...profile, age: '58' }, ['age']],
    ['a fractional age', { ...profile, age: 58.5 }, ['age']],
    ['a distance below the minimum', { ...profile, maxDistanceKm: 0 }, ['maxDistanceKm']],
    ['an unknown stage', { ...profile, stage: 'V' }, ['stage']],
    ['a too-short cancer type', { ...profile, cancerType: 'x' }, ['cancerType']],
    ['two bad fields', { ...profile, sex: 'unknown', city: '' }, ['sex', 'city']],
  ])('names the field for %s', (_label, value, fields) => {
    expect(checkProfile(value)).toEqual({ ok: false, fields })
  })

  it('names a missing field', () => {
    const { country: _country, ...rest } = profile
    expect(checkProfile(rest)).toEqual({ ok: false, fields: ['country'] })
  })
})

describe('formToCandidate', () => {
  const filled = {
    cancerType: '  non-small cell lung cancer ',
    stage: 'III',
    age: '58',
    sex: 'female',
    country: 'India',
    city: 'Pune',
    maxDistanceKm: '200',
    notes: '',
  }

  it('trims text, parses numbers and drops empty notes', () => {
    expect(formToCandidate(form(filled))).toEqual(profile)
  })

  it('keeps notes when given', () => {
    const candidate = formToCandidate(form({ ...filled, notes: ' Had surgery in 2025. ' }))
    expect(candidate).toEqual({ ...profile, notes: 'Had surgery in 2025.' })
  })

  it('leaves an empty age missing rather than zero', () => {
    const result = checkProfile(formToCandidate(form({ ...filled, age: ' ' })))
    expect(result).toEqual({ ok: false, fields: ['age'] })
  })
})

describe('the saved profile', () => {
  it('round-trips through sessionStorage', () => {
    saveProfile(profile)
    expect(loadProfile()).toEqual(profile)
  })

  it('ignores a saved value that is no longer a valid profile', () => {
    sessionStorage.setItem('trialscout.profile', JSON.stringify({ ...profile, age: -1 }))
    expect(loadProfile()).toBeNull()
  })

  it('ignores a saved value that is not JSON', () => {
    sessionStorage.setItem('trialscout.profile', '{')
    expect(loadProfile()).toBeNull()
  })
})
