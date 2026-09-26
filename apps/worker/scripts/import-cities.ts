// Imports GeoNames countries and cities (15,000+ people) into D1, so a patient's city is
// turned into coordinates without any third-party geocoder seeing it.
//
//   cd apps/worker && node scripts/import-cities.ts [--remote]
//
// Downloads countryInfo.txt and cities15000.zip from download.geonames.org (CC BY 4.0) into
// .cache/geonames on first run, then replaces the country, city and city_name tables.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { BatchItem } from 'drizzle-orm/batch'
import type { Db } from '../src/db/index.ts'
import { cities, cityNames, countries } from '../src/db/schema.ts'
import { parseCities, parseCountries } from '../src/geo/geonames.ts'
import { openD1, parseTarget } from './lib/d1.ts'

const GEONAMES = 'https://download.geonames.org/export/dump'
const CACHE = resolve(dirname(fileURLToPath(import.meta.url)), '../../../.cache/geonames')
// D1 allows 100 bound parameters per statement.
const MAX_PARAMS = 100
// Statements per D1 batch call.
const BATCH = 50

async function download(file: string): Promise<string> {
  const target = resolve(CACHE, file)
  if (!existsSync(target)) {
    const response = await fetch(`${GEONAMES}/${file}`, {
      headers: { 'User-Agent': 'trialscout (+https://trialscout.cc)' },
    })
    if (!response.ok) throw new Error(`GeoNames ${file}: HTTP ${response.status}`)
    writeFileSync(target, Buffer.from(await response.arrayBuffer()))
    console.log(`Downloaded ${file}`)
  }
  return target
}

function chunk<T>(rows: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size))
  return out
}

async function run(db: Db, statements: BatchItem<'sqlite'>[]): Promise<void> {
  for (const part of chunk(statements, BATCH)) {
    const [first, ...rest] = part
    if (first !== undefined) await db.batch([first, ...rest])
  }
}

async function main(): Promise<void> {
  mkdirSync(CACHE, { recursive: true })
  const countryRows = parseCountries(readFileSync(await download('countryInfo.txt'), 'utf8'))
  const zip = await download('cities15000.zip')
  const text = execFileSync('unzip', ['-p', zip, 'cities15000.txt'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  const { cities: cityRows, names } = parseCities(text)
  console.log(`${countryRows.length} countries, ${cityRows.length} cities, ${names.length} names`)

  const target = parseTarget(process.argv.slice(2))
  const { db, dispose } = await openD1(target)
  try {
    await db.batch([db.delete(cityNames), db.delete(cities), db.delete(countries)])
    await run(
      db,
      chunk(countryRows, Math.floor(MAX_PARAMS / 4)).map((rows) =>
        db.insert(countries).values(rows),
      ),
    )
    await run(
      db,
      chunk(cityRows, Math.floor(MAX_PARAMS / 6)).map((rows) => db.insert(cities).values(rows)),
    )
    await run(
      db,
      chunk(names, Math.floor(MAX_PARAMS / 2)).map((rows) =>
        db.insert(cityNames).values(rows).onConflictDoNothing(),
      ),
    )
    console.log(`Imported into ${target.remote ? 'remote' : 'local'} D1`)
  } finally {
    await dispose()
  }
}

await main()
