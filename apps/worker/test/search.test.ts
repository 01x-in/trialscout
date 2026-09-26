import type { Profile } from '@trialscout/contract'
import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { createApp } from '../src/app.ts'

const profile: Profile = {
  cancerType: 'non-small cell lung cancer',
  stage: 'III',
  age: 58,
  sex: 'female',
  country: 'India',
  city: 'Pune',
  maxDistanceKm: 200,
}

function search(body: unknown): Promise<Response> {
  return Promise.resolve(
    createApp().request(
      '/api/search',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      env,
    ),
  )
}

describe('POST /api/search validation (Typia)', () => {
  it('accepts a valid profile', async () => {
    const response = await search(profile)

    // Search itself is M1.10; until then a valid profile gets past validation only.
    expect(response.status).toBe(501)
  })

  it('rejects a profile with a wrong type', async () => {
    const response = await search({ ...profile, age: 'fifty-eight' })

    expect(response.status).toBe(400)
  })

  it('rejects a profile that breaks a type tag', async () => {
    const response = await search({ ...profile, maxDistanceKm: 0 })

    expect(response.status).toBe(400)
  })

  it('rejects a profile missing a required field', async () => {
    const { city: _city, ...withoutCity } = profile
    const response = await search(withoutCity)

    expect(response.status).toBe(400)
  })

  it('rejects an unknown stage', async () => {
    const response = await search({ ...profile, stage: 'V' })

    expect(response.status).toBe(400)
  })
})
