// Records the eligibility sections of recruiting trials across cancer types, as the corpus
// the criteria splitter is tested against (fixtures/eligibility/<NCT>.txt, verbatim).
//
//   cd apps/worker && node scripts/record-eligibility.ts

import { mkdir, writeFile } from 'node:fs/promises'
import { CTGOV_BASE_URL } from '../src/clients/ctgov-query.ts'

const OUT = new URL('../../../fixtures/eligibility/', import.meta.url)
const CONDITIONS = [
  'non-small cell lung cancer',
  'breast cancer',
  'colorectal cancer',
  'prostate cancer',
  'melanoma',
  'pancreatic cancer',
  'ovarian cancer',
  'glioblastoma',
  'sarcoma',
  'head and neck cancer',
]
const PER_CONDITION = 3

async function main(): Promise<void> {
  await mkdir(OUT, { recursive: true })
  for (const condition of CONDITIONS) {
    const params = new URLSearchParams({
      format: 'json',
      'query.cond': condition,
      'filter.overallStatus': 'RECRUITING',
      'filter.advanced': 'AREA[StudyType]INTERVENTIONAL',
      fields: 'NCTId,EligibilityCriteria',
      pageSize: String(PER_CONDITION),
    })
    const response = await fetch(`${CTGOV_BASE_URL}/studies?${params}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'trialscout (+https://trialscout.cc)' },
    })
    if (!response.ok) throw new Error(`${condition}: HTTP ${response.status}`)
    const body = (await response.json()) as {
      studies: {
        protocolSection: {
          identificationModule: { nctId: string }
          eligibilityModule?: { eligibilityCriteria?: string }
        }
      }[]
    }
    for (const study of body.studies) {
      const nctId = study.protocolSection.identificationModule.nctId
      const text = study.protocolSection.eligibilityModule?.eligibilityCriteria ?? ''
      await writeFile(new URL(`${nctId}.txt`, OUT), text)
      console.log(`${condition}: ${nctId} (${text.length} chars)`)
    }
  }
}

await main()
