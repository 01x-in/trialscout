import { and, desc, eq } from 'drizzle-orm'
import type { Db } from '../db/index.ts'
import { cities, cityNames, countries } from '../db/schema.ts'
import { countryCode, placeKey } from './places.ts'

// A patient's typed city and country as coordinates, from the GeoNames tables in D1. No
// third-party geocoder sees the profile.

export type Place = { name: string; countryCode: string; lat: number; lon: number }

export type Located =
  | { ok: true; place: Place }
  | { ok: false; reason: 'unknown_country' | 'unknown_city' }

export async function locate(db: Db, city: string, country: string): Promise<Located> {
  const code = countryCode(country, await db.select().from(countries))
  if (code === null) return { ok: false, reason: 'unknown_country' }
  // The most populous city with that name in that country.
  const [found] = await db
    .select({
      name: cities.name,
      countryCode: cities.country_code,
      lat: cities.lat,
      lon: cities.lon,
    })
    .from(cityNames)
    .innerJoin(cities, eq(cities.geonameid, cityNames.geonameid))
    .where(and(eq(cityNames.key, placeKey(city)), eq(cities.country_code, code)))
    .orderBy(desc(cities.population))
    .limit(1)
  return found === undefined ? { ok: false, reason: 'unknown_city' } : { ok: true, place: found }
}
