import { type CountryRow, placeKey } from './places.ts'

// Parsers for GeoNames dumps (https://download.geonames.org/export/dump/, CC BY 4.0).
// Pure functions, shared by the import script and its tests.

export type CityRow = {
  geonameid: number
  name: string
  country_code: string
  lat: number
  lon: number
  population: number
}

export type CityNameRow = { key: string; geonameid: number }

/** countryInfo.txt: ISO, ISO3, ISO-Numeric, fips, Country, ... Lines starting # are comments. */
export function parseCountries(text: string): CountryRow[] {
  const rows: CountryRow[] = []
  for (const line of text.split('\n')) {
    if (line.startsWith('#') || line.trim() === '') continue
    const [code, iso3, , , name] = line.split('\t')
    if (!code || !iso3 || !name) continue
    rows.push({ code, iso3, name, name_key: placeKey(name) })
  }
  return rows
}

// Alternate names are kept only in Latin script, so "Bombay" is found but the many
// translations of a name are not stored.
const LATIN_NAME = /^[\p{Script=Latin}\s.'’-]{2,60}$/u

/**
 * cities15000.txt (19 tab-separated columns): geonameid, name, asciiname, alternatenames,
 * latitude, longitude, ..., country code (8), ..., population (14), ...
 */
export function parseCities(text: string): { cities: CityRow[]; names: CityNameRow[] } {
  const cities: CityRow[] = []
  const names: CityNameRow[] = []
  for (const line of text.split('\n')) {
    const cols = line.split('\t')
    if (cols.length < 15) continue
    const geonameid = Number(cols[0])
    const lat = Number(cols[4])
    const lon = Number(cols[5])
    const population = Number(cols[14] || 0)
    const name = cols[1] ?? ''
    const countryCode = cols[8] ?? ''
    if (!Number.isInteger(geonameid) || !name || !countryCode) continue
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    cities.push({ geonameid, name, country_code: countryCode, lat, lon, population })

    const keys = new Set<string>()
    for (const candidate of [name, cols[2] ?? '', ...(cols[3] ?? '').split(',')]) {
      if (!LATIN_NAME.test(candidate)) continue
      const key = placeKey(candidate)
      if (key !== '') keys.add(key)
    }
    for (const key of keys) names.push({ key, geonameid })
  }
  return { cities, names }
}
