// M1.3 Jev spike: sends real eligibility criteria from two recruiting ClinicalTrials.gov
// trials to Jev for two synthetic profiles, and records every request and response as
// fixtures for later tests. Prints token use, latency and answer spread.
//
//   cd apps/worker && node --env-file-if-exists=.dev.vars scripts/jev-spike.ts
//
// SPIKE_VARIANT=cohort adds a `not_applicable` option for criteria that cover a different
// group of patients; SPIKE_NCT=NCT1,NCT2 reuses those trials instead of searching again.
//
// The profiles are made up; no real patient data is sent anywhere.

import { mkdir, writeFile } from 'node:fs/promises'
import { choice, TypeSafeClient } from '@typesafe-ai/sdk'

const FIXTURES = new URL('../../../fixtures/', import.meta.url)
const CTGOV = 'https://clinicaltrials.gov/api/v2/studies'
const MODEL = process.env.TYPESAFE_MODEL ?? 'jev-latest'
const VARIANT = process.env.SPIKE_VARIANT === 'cohort' ? 'cohort' : null
const NOT_APPLICABLE = {
  not_applicable:
    'The requirement only covers a different group of patients, such as another cancer type or the other sex, so it does not apply to this patient.',
}

type Criterion = { kind: 'inclusion' | 'exclusion'; text: string }
type Profile = { id: string; patient: Record<string, string | number> }
type Study = {
  protocolSection: {
    identificationModule: { nctId: string; briefTitle: string }
    conditionsModule?: { conditions?: string[] }
    eligibilityModule?: { eligibilityCriteria?: string }
  }
}

const PROFILES: Profile[] = [
  {
    id: 'sparse',
    patient: {
      cancer: 'non-small cell lung cancer',
      stage: 'Stage IV',
      age: 64,
      sex: 'male',
    },
  },
  {
    id: 'rich',
    patient: {
      cancer: 'non-small cell lung cancer',
      stage: 'Stage IV',
      age: 58,
      sex: 'female',
      notes:
        'EGFR exon 19 deletion. Took osimertinib for 14 months, then the cancer grew. ' +
        'No brain metastases on my last MRI. I can walk and do light housework but not heavy work. ' +
        'Type 2 diabetes, controlled with metformin. Never had any other cancer. Not pregnant.',
    },
  },
]

const UNKNOWN = 'The patient information does not say enough to tell either way.'

function inclusionQuestion(text: string): ReturnType<typeof choice> {
  return choice(
    `A clinical trial requires this of every participant: "${text}". Going only by what \`patient\` says, does this patient meet the requirement?`,
    {
      meets: 'The patient information shows the patient meets this requirement.',
      does_not_meet: 'The patient information shows the patient does not meet this requirement.',
      not_enough_information: UNKNOWN,
      ...(VARIANT ? NOT_APPLICABLE : {}),
    },
  )
}

function exclusionQuestion(text: string): ReturnType<typeof choice> {
  return choice(
    `A clinical trial turns away anyone this describes: "${text}". Going only by what \`patient\` says, does it describe this patient?`,
    {
      applies: 'The patient information shows this describes the patient.',
      does_not_apply: 'The patient information shows this does not describe the patient.',
      not_enough_information: UNKNOWN,
      ...(VARIANT ? NOT_APPLICABLE : {}),
    },
  )
}

// A crude split for the spike only; M1.6 builds the real splitter.
function roughSplit(eligibility: string): Criterion[] {
  const criteria: Criterion[] = []
  let kind: Criterion['kind'] | null = null
  for (const raw of eligibility.split('\n')) {
    const line = raw.trim()
    if (/^inclusion criteria/i.test(line)) kind = 'inclusion'
    else if (/^exclusion criteria/i.test(line)) kind = 'exclusion'
    else if (kind !== null && /^([*•-]|\d+[.)])\s+/.test(line)) {
      criteria.push({ kind, text: line.replace(/^([*•-]|\d+[.)])\s+/, '') })
    }
  }
  return criteria
}

async function studiesById(ids: string[]): Promise<Study[]> {
  return Promise.all(
    ids.map(async (id) => {
      const response = await fetch(`${CTGOV}/${id}?format=json`, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'trialscout-spike (+https://trialscout.cc)',
        },
      })
      if (!response.ok) throw new Error(`ClinicalTrials.gov ${id}: HTTP ${response.status}`)
      return (await response.json()) as Study
    }),
  )
}

async function recruitingStudies(): Promise<Study[]> {
  const params = new URLSearchParams({
    'query.cond': 'non-small cell lung cancer',
    'filter.overallStatus': 'RECRUITING',
    'query.term': 'AREA[StudyType]INTERVENTIONAL',
    pageSize: '20',
    format: 'json',
  })
  const response = await fetch(`${CTGOV}?${params}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'trialscout-spike (+https://trialscout.cc)',
    },
  })
  if (!response.ok) throw new Error(`ClinicalTrials.gov: HTTP ${response.status}`)
  const body = (await response.json()) as { studies: Study[] }
  return body.studies
}

function summarise(answers: Record<string, { choice: string; confidence: number }>): string {
  const counts: Record<string, number> = {}
  let confidence = 0
  for (const answer of Object.values(answers)) {
    counts[answer.choice] = (counts[answer.choice] ?? 0) + 1
    confidence += answer.confidence
  }
  const n = Object.keys(answers).length
  return `${JSON.stringify(counts)} mean confidence ${(confidence / n).toFixed(2)}`
}

async function main(): Promise<void> {
  const apiKey = process.env.TYPESAFE_API_KEY
  if (!apiKey) throw new Error('Set TYPESAFE_API_KEY in apps/worker/.dev.vars')
  const client = new TypeSafeClient({ apiKey, timeout: 60_000, logLevel: 'warn' })

  // Two trials with a moderate number of criteria, so one request per trial is realistic.
  const ids = process.env.SPIKE_NCT?.split(',').filter(Boolean) ?? []
  const picked = (ids.length > 0 ? await studiesById(ids) : await recruitingStudies())
    .map((study) => ({
      study,
      criteria: roughSplit(study.protocolSection.eligibilityModule?.eligibilityCriteria ?? ''),
    }))
    .filter(({ criteria }) => criteria.length >= 12 && criteria.length <= 45)
    .slice(0, 2)
  if (picked.length < 2) throw new Error('Did not find two trials with 12-45 criteria')

  await mkdir(new URL('ctgov/', FIXTURES), { recursive: true })
  await mkdir(new URL('jev/', FIXTURES), { recursive: true })

  const all: { trial: (typeof picked)[number]; profile: Profile; limit?: number }[] = [
    { trial: picked[0]!, profile: PROFILES[0]! },
    { trial: picked[0]!, profile: PROFILES[1]! },
    { trial: picked[1]!, profile: PROFILES[1]! },
    // One question on the same state, to measure the fixed cost of a request.
    { trial: picked[0]!, profile: PROFILES[1]!, limit: 1 },
  ]
  // The cohort variant is compared on the rich profile only.
  const runs = VARIANT ? all.filter((run) => run.profile.id === 'rich' && !run.limit) : all

  for (const { study } of picked) {
    const nctId = study.protocolSection.identificationModule.nctId
    await writeFile(new URL(`ctgov/${nctId}.json`, FIXTURES), `${JSON.stringify(study, null, 2)}\n`)
  }

  for (const { trial, profile, limit } of runs) {
    const { nctId, briefTitle } = trial.study.protocolSection.identificationModule
    const criteria = trial.criteria.slice(0, limit ?? trial.criteria.length)
    const questions = Object.fromEntries(
      criteria.map((c, i) => [
        `${c.kind === 'inclusion' ? 'inc' : 'exc'}_${i}`,
        c.kind === 'inclusion' ? inclusionQuestion(c.text) : exclusionQuestion(c.text),
      ]),
    )
    const state = {
      patient: profile.patient,
      trial: {
        title: briefTitle,
        conditions: trial.study.protocolSection.conditionsModule?.conditions ?? [],
      },
    }
    const started = Date.now()
    const response = await client.systemOne({ state, questions, model: MODEL })
    const latencyMs = Date.now() - started
    const name = `${nctId}-${profile.id}${limit ? `-first${limit}` : ''}${VARIANT ? `-${VARIANT}` : ''}`
    await writeFile(
      new URL(`jev/${name}.json`, FIXTURES),
      `${JSON.stringify({ request: { state, questions, model: MODEL }, response, latencyMs, criteria }, null, 2)}\n`,
    )
    const inputTokens = response.usage?.input_tokens ?? 0
    console.log(
      `${name}: model ${response.model}, ${criteria.length} questions, ${inputTokens} input tokens ` +
        `(${(inputTokens / criteria.length).toFixed(0)}/question), ${latencyMs} ms, ` +
        summarise(response.answers as Record<string, { choice: string; confidence: number }>),
    )
  }
}

await main()
