// Place names as lookup keys: the same function builds the keys GeoNames rows are stored
// under and the key a patient's typed city or country is looked up by.

/** Lowercase, accents and punctuation removed, single spaces: "São Paulo" -> "sao paulo". */
export function placeKey(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[.'’]/g, '')
    .replace(/[-_,/()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export type CountryRow = { code: string; iso3: string; name: string; name_key: string }

// Common names people type that are not GeoNames' country name or ISO code.
const COUNTRY_ALIASES: Record<string, string> = {
  america: 'US',
  'united states of america': 'US',
  'the united states': 'US',
  'u s a': 'US',
  uk: 'GB',
  'great britain': 'GB',
  britain: 'GB',
  england: 'GB',
  scotland: 'GB',
  wales: 'GB',
  'northern ireland': 'GB',
  'the netherlands': 'NL',
  holland: 'NL',
  'south korea': 'KR',
  korea: 'KR',
  'republic of korea': 'KR',
  russia: 'RU',
  'czech republic': 'CZ',
  czechia: 'CZ',
  vietnam: 'VN',
  'viet nam': 'VN',
  turkey: 'TR',
  turkiye: 'TR',
  uae: 'AE',
  'the uae': 'AE',
  'ivory coast': 'CI',
  'hong kong sar': 'HK',
  'mainland china': 'CN',
  prc: 'CN',
  taiwan: 'TW',
}

/** The ISO alpha-2 code for a typed country name, ISO code or common alias, or null. */
export function countryCode(text: string, countries: CountryRow[]): string | null {
  const key = placeKey(text)
  if (key === '') return null
  const alias = COUNTRY_ALIASES[key]
  if (alias !== undefined) return alias
  const upper = key.toUpperCase()
  const found = countries.find((c) => c.name_key === key || c.code === upper || c.iso3 === upper)
  return found?.code ?? null
}
