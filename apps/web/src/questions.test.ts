import type { CriterionVerdict } from '@trialscout/contract'
import { describe, expect, it } from 'vitest'
import { doctorQuestion } from './questions.ts'

function ask(
  kind: CriterionVerdict['kind'],
  text: string,
  verdict: CriterionVerdict['verdict'] = 'ask_your_doctor',
): CriterionVerdict {
  return { kind, text, group: null, verdict, confidence: 0.6 }
}

// Real rules from ClinicalTrials.gov eligibility sections (fixtures/eligibility).
const CASES: [CriterionVerdict['kind'], string, RegExp][] = [
  ['inclusion', 'Bilirubin ≤ 1.5 times upper limit of normal', /blood test/],
  ['inclusion', 'a. Serum creatinine ≤1.5xULN', /blood test/],
  [
    'inclusion',
    'AST/ALT ≤ 2.5× the upper limit of normal (ULN). Subjects with liver metastasis may have AST, ALP, and ALT ≤ 5.0 X ULN.',
    /blood test/,
  ],
  [
    'inclusion',
    'ECOG performance status of 0 to 2; Karnofsky Performance Status ≥ 60.',
    /daily activities/,
  ],
  ['inclusion', 'Life expectancy of at least 2 months.', /general health/],
  ['exclusion', 'Prior treatment with Bevacizumab', /treatments I have had/],
  [
    'exclusion',
    'The subject has received any of the following prior anticancer therapy:',
    /treatments I have had/,
  ],
  ['inclusion', 'Absence of distant metastases (M0)', /where the cancer has spread/],
  ['exclusion', 'Known untreated brain metastases', /where the cancer has spread/],
  ['inclusion', 'Solid tumors with NRAS activating mutations', /tests on the cancer/],
  ['inclusion', 'Documented EGFR exon 19 deletion or L858R', /tests on the cancer/],
  [
    'inclusion',
    'creatinine within normal institutional limits OR eGFR within normal as predicted by the CKD-EPI equation > 60 mL/min/1.73 m2.',
    /blood test/,
  ],
  [
    'exclusion',
    'A prolonged QTc rhythm noted during initial ECG >480 ms.',
    /heart, liver or kidneys/,
  ],
  [
    'exclusion',
    'clinically significant cardiac arrhythmias not controlled by appropriate medications',
    /heart, liver or kidneys/,
  ],
  ['exclusion', 'Active HIV infection', /infections/],
  ['exclusion', 'The subject is pregnant or breast-feeding.', /pregnancy/],
  ['inclusion', 'Patient must have measurable disease as per RECIST v1.1.', /scans/],
  ['inclusion', 'Participants must have measurable liver metastatic disease.', /scans/],
  ['inclusion', 'Able to provide written informed consent.', /steps the study asks/],
  [
    'inclusion',
    'Ability to tolerate PO meds and comply with study procedures',
    /steps the study asks/,
  ],
]

// Words a patient-facing question of ours must never use: medical terms belong only inside
// the quoted rule, and nothing may promise a place on the trial.
const JARGON =
  /\b(ECOG|RECIST|ULN|metasta\w*|creatinine|bilirubin|cardiac|hepatic|renal|mutation|eligib\w*|qualif\w*|match\w*)\b/i

describe('doctorQuestion', () => {
  it.each(CASES)('asks a plain question about a %s rule: %s', (kind, text, topic) => {
    const question = doctorQuestion(ask(kind, text))

    expect(question).toMatch(topic)
    expect(question).not.toMatch(JARGON)
    expect(question).toMatch(/\?$/)
  })

  it('falls back to a plain question for a rule on no known topic', () => {
    expect(doctorQuestion(ask('inclusion', 'Resident of the catchment area'))).toBe(
      'Do I meet this rule?',
    )
    expect(doctorQuestion(ask('exclusion', 'Resident of the catchment area'))).toBe(
      'Does this rule apply to me?',
    )
  })

  it('asks the doctor to confirm a likely fail, never taking it as final', () => {
    expect(doctorQuestion(ask('inclusion', 'Stage IV disease', 'likely_fails'))).toBe(
      'The check suggests I do not meet this rule. Is that right?',
    )
    expect(
      doctorQuestion(ask('exclusion', 'Prior treatment with Bevacizumab', 'likely_fails')),
    ).toBe('The check suggests this rule keeps me out. Is that right?')
  })

  it('never uses medical terms or promises in any template', () => {
    for (const kind of ['inclusion', 'exclusion'] as const) {
      for (const verdict of ['ask_your_doctor', 'not_checked', 'likely_fails'] as const) {
        for (const [, text] of CASES) {
          expect(doctorQuestion(ask(kind, text, verdict))).not.toMatch(JARGON)
        }
      }
    }
  })
})
