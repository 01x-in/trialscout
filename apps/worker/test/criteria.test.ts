import { describe, expect, it } from 'vitest'
import { type Criterion, splitCriteria } from '../src/criteria.ts'

// The corpus: verbatim eligibility sections of recruiting trials across ten cancer types
// (scripts/record-eligibility.ts).
const CORPUS = import.meta.glob<string>('../../../fixtures/eligibility/*.txt', {
  query: '?raw',
  import: 'default',
  eager: true,
})

function inc(text: string, group: string | null = null): Criterion {
  return { kind: 'inclusion', text, group }
}
function exc(text: string, group: string | null = null): Criterion {
  return { kind: 'exclusion', text, group }
}

describe('splitCriteria', () => {
  it.each<[string, string, Criterion[]]>([
    [
      'bulleted sections',
      'Inclusion Criteria:\n\n* Age 18 or over\n* Stage IV disease\n\nExclusion Criteria:\n\n* Pregnant',
      [inc('Age 18 or over'), inc('Stage IV disease'), exc('Pregnant')],
    ],
    [
      'numbered lists with nested items kept with their parent',
      'Inclusion Criteria:\n\n1. Acceptable liver function:\n\n    1. Bilirubin ≤ 1.5 x ULN\n    2. ALT ≤ 3 x ULN\n2. ECOG 0-1\n\nExclusion Criteria:\n\n1. Active infection',
      [
        inc('Acceptable liver function:\n1. Bilirubin ≤ 1.5 x ULN\n2. ALT ≤ 3 x ULN'),
        inc('ECOG 0-1'),
        exc('Active infection'),
      ],
    ],
    [
      '"one of the following" alternatives kept together',
      'Inclusion Criteria:\n\n3. Meet one of the following criteria:\n\n   1. Platinum sensitive\n   2. Platinum resistant\n\nExclusion Criteria:\n\n* None of the above',
      [
        inc('Meet one of the following criteria:\n1. Platinum sensitive\n2. Platinum resistant'),
        exc('None of the above'),
      ],
    ],
    [
      'wrapped lines joined to their item',
      'Inclusion Criteria:\n\n* Histologically confirmed\n  adenocarcinoma of the lung\n* Age 18+\n\nExclusion Criteria:\n\n* Prior chemotherapy',
      [
        inc('Histologically confirmed\nadenocarcinoma of the lung'),
        inc('Age 18+'),
        exc('Prior chemotherapy'),
      ],
    ],
    [
      'a paragraph that an item introduces with a colon kept with that item',
      'Inclusion Criteria:\n\n1. A mutation in any gene listed below:\n\nATM, ATR, BRCA1, BRCA2\n\nA later paragraph.\n\nExclusion Criteria:\n\n* Pregnant',
      [
        inc('A mutation in any gene listed below:\nATM, ATR, BRCA1, BRCA2'),
        inc('A later paragraph.'),
        exc('Pregnant'),
      ],
    ],
    [
      'markdown escapes removed',
      'Inclusion Criteria:\n\n1\\. ANC \\>= 1500/mm\\^3\n2\\. Creatinine \\< 1.5 \\[mg/dL\\]\n\nExclusion Criteria:\n\n* None',
      [inc('ANC >= 1500/mm^3'), inc('Creatinine < 1.5 [mg/dL]'), exc('None')],
    ],
    [
      'inclusion items joined by "or" kept together, so neither is required alone',
      'Inclusion Criteria:\n\n* Stage IV disease; or\n* Recurrent disease after surgery; OR\n* Unresectable disease\n* Age 18+\n\nExclusion Criteria:\n\n* Pregnant; or\n* Breastfeeding',
      [
        inc('Stage IV disease; or\nRecurrent disease after surgery; OR\nUnresectable disease'),
        inc('Age 18+'),
        exc('Pregnant; or'),
        exc('Breastfeeding'),
      ],
    ],
    [
      'group labels inside a section',
      'Inclusion Criteria:\n\nMain study cohort:\n\n1. Ovarian cancer\n\nAll participants:\n\n1. Age 18+\n\nExclusion Criteria:\n\n* Pregnant',
      [
        inc('Ovarian cancer', 'Main study cohort'),
        inc('Age 18+', 'All participants'),
        exc('Pregnant'),
      ],
    ],
    [
      'cohort named in the heading',
      'Inclusion Criteria- All Cohorts\n\n* Age 18+\n\nInclusion Criteria-Metastatic Colorectal Carcinoma\n\n* KRAS mutant\n\nExclusion Criteria- All Cohorts\n\n* Pregnant',
      [
        inc('Age 18+', 'All Cohorts'),
        inc('KRAS mutant', 'Metastatic Colorectal Carcinoma'),
        exc('Pregnant', 'All Cohorts'),
      ],
    ],
    [
      'headings written as sentences, in capitals or in bold',
      'Subjects are eligible to be included in the study only if all of the following criteria apply:\n\n* Age 18+\n\n**EXCLUSION CRITERIA:**\n\n* Pregnant\n\nSubjects are excluded from the study if any of the following criteria apply:\n\n* HIV',
      [inc('Age 18+'), exc('Pregnant'), exc('HIV')],
    ],
    [
      'paragraphs without bullets',
      'Inclusion Criteria:\n\nAge 18 or over.\n\nConfirmed melanoma.\n\nExclusion Criteria:\n\nBrain metastases.',
      [inc('Age 18 or over.'), inc('Confirmed melanoma.'), exc('Brain metastases.')],
    ],
    [
      'a criterion on the heading line',
      'Inclusion Criteria: Age 18 or over\n* Stage IV\nExclusion Criteria: Pregnant',
      [inc('Age 18 or over'), inc('Stage IV'), exc('Pregnant')],
    ],
    [
      'text before the first heading ignored',
      'Patients will be screened by the study team.\n\nInclusion Criteria:\n\n* Age 18+\n\nExclusion Criteria:\n\n* Pregnant',
      [inc('Age 18+'), exc('Pregnant')],
    ],
    [
      'Windows line endings and tabs',
      'Inclusion Criteria:\r\n\r\n* Age 18+\r\n\t* over 18 means 18 or older\r\nExclusion Criteria:\r\n* Pregnant',
      [inc('Age 18+\n* over 18 means 18 or older'), exc('Pregnant')],
    ],
  ])('splits %s', (_label, text, expected) => {
    expect(splitCriteria(text)).toEqual({ ok: true, criteria: expected })
  })

  it.each<[string, string | null, string]>([
    ['no text', null, 'empty'],
    ['blank text', '   \n  ', 'empty'],
    ['no inclusion or exclusion heading', '* Age 18+\n* Stage IV\n* Not pregnant', 'no_sections'],
    [
      'headings with nothing under them',
      'Inclusion Criteria:\n\nExclusion Criteria:\n',
      'no_criteria',
    ],
    [
      'a mixed heading that cannot be classified',
      'Inclusion and Exclusion Criteria:\n\n* Age 18+',
      'no_sections',
    ],
  ])('does not split %s', (_label, text, reason) => {
    expect(splitCriteria(text)).toEqual({ ok: false, reason })
  })
})

describe('splitCriteria on real trials', () => {
  const files = Object.entries(CORPUS)

  it('has a corpus of real eligibility sections', () => {
    expect(files.length).toBeGreaterThanOrEqual(25)
  })

  it.each(files)('splits %s into inclusion and exclusion criteria', (_file, text) => {
    const result = splitCriteria(text)
    if (!result.ok) throw new Error(`Not split: ${result.reason}`)

    expect(result.criteria.some((c) => c.kind === 'inclusion')).toBe(true)
    expect(result.criteria.some((c) => c.kind === 'exclusion')).toBe(true)
    for (const criterion of result.criteria) {
      expect(criterion.text.trim()).toBe(criterion.text)
      expect(criterion.text).not.toMatch(/^([*•+-]|\d{1,3}[.)])\s/)
      expect(criterion.text).not.toMatch(/^(inclusion|exclusion) criteria\s*:?$/i)
    }
  })

  it.each(files)(
    'quotes %s verbatim: every line of every criterion is in the source',
    (_f, text) => {
      const result = splitCriteria(text)
      if (!result.ok) throw new Error(`Not split: ${result.reason}`)
      const source = text.replace(/\\(.)/g, '$1').replace(/\s+/g, ' ')

      for (const criterion of result.criteria) {
        for (const line of criterion.text.split('\n')) {
          expect(source).toContain(line.replace(/\s+/g, ' '))
        }
      }
    },
  )
})
