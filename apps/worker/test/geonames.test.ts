import { describe, expect, it } from 'vitest'
import { parseCities, parseCountries } from '../src/geo/geonames.ts'
import { countryCode, placeKey } from '../src/geo/places.ts'

// Rows in GeoNames' own tab-separated layout, trimmed to a few alternate names.
const CITIES = [
  [
    '1275339',
    'Mumbai',
    'Mumbai',
    'Bombay,Bombaim,Mumbai,मुंबई,ムンバイ',
    '19.07283',
    '72.88261',
    'P',
    'PPLA',
    'IN',
    '',
    '16',
    '22',
    '',
    '',
    '12691836',
    '',
    '8',
    'Asia/Kolkata',
    '2023-01-01',
  ],
  [
    '3448439',
    'São Paulo',
    'Sao Paulo',
    'San Paulo,Sao Paulo,São Paulo,サンパウロ',
    '-23.5475',
    '-46.63611',
    'P',
    'PPLA',
    'BR',
    '',
    '27',
    '',
    '',
    '',
    '10021295',
    '',
    '769',
    'America/Sao_Paulo',
    '2023-01-01',
  ],
  ['not', 'a', 'city'],
]
  .map((row) => row.join('\t'))
  .join('\n')

const COUNTRIES = [
  '# ISO\tISO3\tISO-Numeric\tfips\tCountry\tCapital',
  ['IN', 'IND', '356', 'IN', 'India', 'New Delhi'].join('\t'),
  ['US', 'USA', '840', 'US', 'United States', 'Washington'].join('\t'),
  ['GB', 'GBR', '826', 'UK', 'United Kingdom', 'London'].join('\t'),
].join('\n')

describe('placeKey', () => {
  it.each([
    ['São Paulo', 'sao paulo'],
    ['  NEW   york ', 'new york'],
    ['St. Louis', 'st louis'],
    ["Coeur d'Alene", 'coeur dalene'],
    ['Winston-Salem', 'winston salem'],
    ['Zürich', 'zurich'],
  ])('%j -> %j', (text, key) => {
    expect(placeKey(text)).toBe(key)
  })
})

describe('parseCountries', () => {
  it('reads code, ISO3 and name, skipping comments', () => {
    expect(parseCountries(COUNTRIES)).toEqual([
      { code: 'IN', iso3: 'IND', name: 'India', name_key: 'india' },
      { code: 'US', iso3: 'USA', name: 'United States', name_key: 'united states' },
      { code: 'GB', iso3: 'GBR', name: 'United Kingdom', name_key: 'united kingdom' },
    ])
  })
})

describe('countryCode', () => {
  const countries = parseCountries(COUNTRIES)

  it.each([
    ['India', 'IN'],
    ['india', 'IN'],
    ['IN', 'IN'],
    ['IND', 'IN'],
    ['USA', 'US'],
    ['United States of America', 'US'],
    ['UK', 'GB'],
    ['England', 'GB'],
    ['Atlantis', null],
  ])('%j -> %j', (text, code) => {
    expect(countryCode(text, countries)).toBe(code)
  })
})

describe('parseCities', () => {
  const { cities, names } = parseCities(CITIES)

  it('reads each well-formed city', () => {
    expect(cities).toEqual([
      {
        geonameid: 1275339,
        name: 'Mumbai',
        country_code: 'IN',
        lat: 19.07283,
        lon: 72.88261,
        population: 12691836,
      },
      {
        geonameid: 3448439,
        name: 'São Paulo',
        country_code: 'BR',
        lat: -23.5475,
        lon: -46.63611,
        population: 10021295,
      },
    ])
  })

  it('keys each city by its names and Latin alternate names, once each', () => {
    const keysFor = (id: number): string[] =>
      names
        .filter((n) => n.geonameid === id)
        .map((n) => n.key)
        .sort()

    expect(keysFor(1275339)).toEqual(['bombaim', 'bombay', 'mumbai'])
    expect(keysFor(3448439)).toEqual(['san paulo', 'sao paulo'])
  })
})
