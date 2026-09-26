import type { Profile } from '@trialscout/contract'
import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { createApp } from '../src/app.ts'
import { PROBLEM_JSON } from '../src/problems.ts'

const profile: Profile = {
  cancerType: 'non-small cell lung cancer',
  stage: 'III',
  age: 58,
  sex: 'female',
  country: 'India',
  city: 'Pune',
  maxDistanceKm: 200,
  notes: 'EGFR positive. Had osimertinib.',
}

function search(body: unknown, bindings: object = env): Promise<Response> {
  return Promise.resolve(
    createApp().request(
      '/api/search',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      bindings,
    ),
  )
}

async function detail(response: Response): Promise<string> {
  return ((await response.json()) as { detail: string }).detail
}

describe('POST /api/search validation (Typia)', () => {
  it('accepts a valid profile', async () => {
    const response = await search(profile)

    // Search itself is M1.10; until then a valid profile gets past validation only.
    expect(response.status).toBe(501)
    expect(response.headers.get('content-type')).toBe(PROBLEM_JSON)
  })

  it.each([
    ['a wrong type', { ...profile, age: 'fifty-eight' }, 'Invalid request: body.age'],
    ['a broken type tag', { ...profile, maxDistanceKm: 0 }, 'Invalid request: body.maxDistanceKm'],
    ['an unknown stage', { ...profile, stage: 'V' }, 'Invalid request: body.stage'],
    [
      'two bad fields',
      { ...profile, sex: 'other', city: '' },
      'Invalid request: body.sex, body.city',
    ],
  ])('answers %s with a 422 naming the field', async (_label, body, expected) => {
    const response = await search(body)

    expect(response.status).toBe(422)
    expect(response.headers.get('content-type')).toBe(PROBLEM_JSON)
    expect(await detail(response)).toBe(expected)
  })

  it('answers a missing field with a 422 naming it', async () => {
    const { city: _city, ...withoutCity } = profile
    const response = await search(withoutCity)

    expect(response.status).toBe(422)
    expect(await detail(response)).toBe('Invalid request: body.city')
  })

  it('never echoes profile contents in an error', async () => {
    const response = await search({ ...profile, age: 'fifty-eight' })
    const text = await response.text()

    expect(text).not.toContain('fifty-eight')
    expect(text).not.toContain('osimertinib')
    expect(text).not.toContain('Pune')
  })

  it('refuses to run on invalid Worker config', async () => {
    const response = await search(profile, { ...env, TYPESAFE_MODEL: ' ' })

    expect(response.status).toBe(500)
    expect(await detail(response)).toBe('An unexpected error occurred.')
  })
})
