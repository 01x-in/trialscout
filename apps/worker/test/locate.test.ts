import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../src/db/index.ts'
import { cities, cityNames, countries } from '../src/db/schema.ts'
import { locate } from '../src/geo/locate.ts'

beforeEach(async () => {
  const db = createDb(env.DB)
  await db.insert(countries).values([
    { code: 'IN', iso3: 'IND', name: 'India', name_key: 'india' },
    { code: 'US', iso3: 'USA', name: 'United States', name_key: 'united states' },
    { code: 'GB', iso3: 'GBR', name: 'United Kingdom', name_key: 'united kingdom' },
  ])
  await db.insert(cities).values([
    { geonameid: 1, name: 'Mumbai', country_code: 'IN', lat: 19.07, lon: 72.88, population: 12e6 },
    {
      geonameid: 2,
      name: 'Boston',
      country_code: 'US',
      lat: 42.36,
      lon: -71.06,
      population: 650e3,
    },
    { geonameid: 3, name: 'Boston', country_code: 'GB', lat: 52.97, lon: -0.02, population: 45e3 },
  ])
  await db.insert(cityNames).values([
    { key: 'mumbai', geonameid: 1 },
    { key: 'bombay', geonameid: 1 },
    { key: 'boston', geonameid: 2 },
    { key: 'boston', geonameid: 3 },
  ])
})

describe('locate', () => {
  it('finds a city by an alternate name', async () => {
    expect(await locate(createDb(env.DB), 'Bombay', 'India')).toEqual({
      ok: true,
      place: { name: 'Mumbai', countryCode: 'IN', lat: 19.07, lon: 72.88 },
    })
  })

  it('uses the country to tell same-named cities apart', async () => {
    const uk = await locate(createDb(env.DB), 'boston', 'UK')
    const us = await locate(createDb(env.DB), 'Boston', 'USA')

    expect(uk.ok && uk.place.countryCode).toBe('GB')
    expect(us.ok && us.place.countryCode).toBe('US')
  })

  it('says when the country is not known', async () => {
    expect(await locate(createDb(env.DB), 'Mumbai', 'Atlantis')).toEqual({
      ok: false,
      reason: 'unknown_country',
    })
  })

  it('says when the city is not in that country', async () => {
    expect(await locate(createDb(env.DB), 'Mumbai', 'United States')).toEqual({
      ok: false,
      reason: 'unknown_city',
    })
  })
})
