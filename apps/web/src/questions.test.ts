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
  // From NCT06899126: a consent form named after pregnant partners is still about consent.
  [
    'inclusion',
    'Sign and date the Optional PGx ICF (included in the Main ICF) prior to any PGx procedure, and the Pregnant Partner ICF, if applicable.',
    /steps the study asks/,
  ],
  [
    'inclusion',
    'Women of childbearing potential must be willing to use highly effective contraception',
    /pregnancy/,
  ],
  [
    'inclusion',
    'Ability to tolerate PO meds and comply with study procedures',
    /steps the study asks/,
  ],
  // Live checks on 2026-09-27 that picked the wrong topic. "Metastatic setting" names when a
  // treatment was given, not where the cancer has spread.
  [
    'inclusion',
    'Documented extra-cranial radiologic progression on prior osimertinib monotherapy (as most recent line of treatment) in the adjuvant, locally advanced, or metastatic setting.',
    /treatments I have had/,
  ],
  [
    'exclusion',
    'Use of chemotherapy, vascular endothelial growth factor inhibitor, immunotherapy or any anti-cancer therapy in the metastatic setting. Platinum-based chemotherapy in non-metastatic setting within 12 months prior to randomization.',
    /treatments I have had/,
  ],
  // A list of many conditions is not about the one infection it names.
  [
    'exclusion',
    'Any evidence of severe or uncontrolled systemic diseases, including, but not limited to active bleeding diseases, active infection, active ILD/pneumonitis, cardiac disease.',
    /other health problems/,
  ],
  // Surgery or radiation the cancer is not suitable for is not a past treatment.
  [
    'inclusion',
    'Histologically or cytologically confirmed NSCLC with Stage IIIB-IIIC or Stage IV disease, not suitable for curative intent radical surgery or radiation therapy.',
    /stage of the cancer/,
  ],
  // Rules from the same trials that were already right, and must stay so.
  [
    'inclusion',
    'Less than or equal to (<=2) prior lines of EGFR TKIs (osimertinib is the only permitted prior third generation EGFR TKI).',
    /treatments I have had/,
  ],
  // Past treatment decides, even when the rule names a stage.
  [
    'inclusion',
    'Participants must not have received prior EGFR TKIs or other systemic therapy for Stage IIIB, IIIC or IV NSCLC.',
    /treatments I have had/,
  ],
  [
    'exclusion',
    'Uncontrolled infection requiring systemic antibiotics, antivirals, or antifungals, suspected infections or inability to rule out infections. Use of systemic antibiotics within 14 days of randomization.',
    /infections/,
  ],
  [
    'exclusion',
    'Participants with symptomatic brain metastases (including leptomeningeal involvement).',
    /where the cancer has spread/,
  ],
  ['exclusion', 'Major surgery within 4 weeks prior to randomization.', /treatments I have had/],
  // From the PR #7 review.
  [
    'inclusion',
    'No signs of extra hepatic metastatic disease or local recurrence according to CT scan+MRI+PET/CT scans.',
    /where the cancer has spread/,
  ],
  [
    'exclusion',
    'The subject has not recovered to CTCAE v4.0 Grade ≤1 from AEs (except alopecia, anemia, and lymphopenia) due to antineoplastic agents, investigational drugs, or other medications that were administered prior to study.',
    /treatments I have had/,
  ],
  // The reviewer's examples: no saved rule words them this way on its own.
  ['inclusion', 'Stage IV with spinal metastases', /where the cancer has spread/],
  ['exclusion', 'History of radiation-induced pneumonitis', /^Does this rule apply to me\?$/],
  // Saved rules that went wrong while the matching above was being fixed.
  ['exclusion', 'Known current metastatic disease.', /where the cancer has spread/],
  ['inclusion', 'Able to swallow oral medication.', /^Do I meet this rule\?$/],
  [
    'exclusion',
    'History of ILD/pneumonitis, including radiation pneumonitis (apart from radiation pneumonitis that did not require steroids), or drug-induced ILD/pneumonitis, or has suspected ILD/pneumonitis that cannot be ruled out by imaging at screening. Examples of suspected ILD/pneumonitis by imaging include the presence of lung parenchymal fibrosis, such as combined pulmonary fibrosis and emphysema (CPFE), and any radiographic features consistent with interstitial lung abnormalities, including but not limited to, extensive ground glass opacities, reticular opacities, traction bronchiectasis, and honeycombing.',
    /^Does this rule apply to me\?$/,
  ],
  [
    'inclusion',
    'Sites must seek additional patient consent for the future use of specimens',
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
