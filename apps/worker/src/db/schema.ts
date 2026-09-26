import { index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// Cached ClinicalTrials.gov data and the GeoNames place tables. No patient data is ever
// stored here: profiles are used for scoring and discarded.

export const trials = sqliteTable('trial', {
  nct_id: text('nct_id').primaryKey(),
  // ClinicalTrials.gov lastUpdatePostDate; with nct_id it identifies the trial version.
  version: text('version').notNull(),
  title: text('title').notNull(),
  phases: text('phases', { mode: 'json' }).notNull().$type<string[]>(),
  sponsor: text('sponsor'),
  conditions: text('conditions', { mode: 'json' }).notNull().$type<string[]>(),
  status: text('status').notNull(),
  // The verbatim eligibility section, or null when the trial has none.
  criteria: text('criteria'),
  sex: text('sex', { enum: ['ALL', 'FEMALE', 'MALE'] }).notNull(),
  min_age_years: real('min_age_years'),
  max_age_years: real('max_age_years'),
  // The version the criteria rows belong to; null until split. A newer version is re-split.
  split_version: text('split_version'),
  // False when the eligibility text could not be split: show it raw with "ask your doctor".
  split_ok: integer('split_ok', { mode: 'boolean' }),
  // Epoch milliseconds; shown as "data as of" when ClinicalTrials.gov is down.
  fetched_at: integer('fetched_at').notNull(),
})

export const sites = sqliteTable(
  'site',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    nct_id: text('nct_id')
      .notNull()
      .references(() => trials.nct_id, { onDelete: 'cascade' }),
    facility: text('facility'),
    city: text('city'),
    state: text('state'),
    country: text('country'),
    status: text('status'),
    lat: real('lat'),
    lon: real('lon'),
  },
  (t) => [index('site_nct_id').on(t.nct_id)],
)

// One row per inclusion or exclusion line, split once per trial version for all users.
export const criteria = sqliteTable(
  'criterion',
  {
    nct_id: text('nct_id')
      .notNull()
      .references(() => trials.nct_id, { onDelete: 'cascade' }),
    version: text('version').notNull(),
    position: integer('position').notNull(),
    kind: text('kind', { enum: ['inclusion', 'exclusion'] }).notNull(),
    // Verbatim from the source; shown next to every verdict.
    text: text('text').notNull(),
  },
  (t) => [primaryKey({ columns: [t.nct_id, t.version, t.position] })],
)

// GeoNames countryInfo.txt.
export const countries = sqliteTable(
  'country',
  {
    // ISO 3166-1 alpha-2, as GeoNames and the cities table use it.
    code: text('code').primaryKey(),
    iso3: text('iso3').notNull(),
    name: text('name').notNull(),
    // placeKey(name), for lookups.
    name_key: text('name_key').notNull(),
  },
  (t) => [index('country_name_key').on(t.name_key)],
)

// GeoNames cities15000.txt: places with 15,000 people or more.
export const cities = sqliteTable(
  'city',
  {
    geonameid: integer('geonameid').primaryKey(),
    name: text('name').notNull(),
    country_code: text('country_code').notNull(),
    lat: real('lat').notNull(),
    lon: real('lon').notNull(),
    population: integer('population').notNull(),
  },
  (t) => [index('city_country').on(t.country_code)],
)

// Every name a city is looked up by: its name, ASCII name and Latin alternate names
// ("Bombay" for Mumbai), as placeKey() values.
export const cityNames = sqliteTable(
  'city_name',
  {
    key: text('key').notNull(),
    geonameid: integer('geonameid')
      .notNull()
      .references(() => cities.geonameid, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.key, t.geonameid] })],
)

export const schema = { trials, sites, criteria, countries, cities, cityNames }
