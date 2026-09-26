import type { CriterionVerdict } from '@trialscout/contract'

// Plain questions for the doctor, from templates in code: Jev cannot write text (M1.3). The
// patterns below only pick a topic; the question itself uses everyday words, and medical
// terms appear only in the quoted rule shown next to it. Topics are tried in order, so a
// rule about blood tests that mentions spread is still about blood tests. Gene names are
// matched case-sensitively, so "EGFR" (a gene) is not read as "eGFR" (a kidney test).

type Topic = { pattern: RegExp; question: string }

const CONSENT = 'This rule is about the steps the study asks of people. What would they involve?'

const TOPICS: Topic[] = [
  // Consent forms first: their names mention other topics ("Pregnant Partner ICF").
  {
    pattern: /\b(informed consent|consent forms?|ICFs?|sign(ed)? and date[ds]?)\b/i,
    question: CONSENT,
  },
  {
    pattern: /\b(pregnan\w*|breast[- ]?feeding|lactat\w*|contracepti\w*|childbearing)\b/i,
    question: 'This rule is about pregnancy or birth control. What would it mean for me?',
  },
  {
    pattern: /\b(HIV|hepatitis|infections?|tuberculosis)\b/i,
    question: 'This rule is about infections I have or have had. Does it apply to me?',
  },
  {
    pattern:
      /\b(ULN|upper limit of normal|h(a)?emoglobin|neutrophils?|platelets?|creatinine|bilirubin|AST|ALT|ANC|albumin|laborator\w*|lab values?|blood counts?)\b/i,
    question: 'This rule depends on blood test results. Do my latest results meet it?',
  },
  {
    pattern: /\b(measurable|evaluable|RECIST)\b/i,
    question: 'This rule depends on what my scans show. Do my scans meet it?',
  },
  {
    pattern: /\b(metasta\w*|brain|CNS|leptomeningeal|spread)\b/i,
    question: 'This rule is about where the cancer has spread. Does it apply to me?',
  },
  {
    pattern:
      /\b(cardiac|heart|QTc?|ECG|ejection fraction|myocardial|arrhythmi\w*|hepatic|liver function|renal|kidney)\b/i,
    question: 'This rule is about how well my heart, liver or kidneys work. Do I meet it?',
  },
  {
    pattern: /\b(ECOG|Karnofsky|performance status)\b/i,
    question: 'This rule is about how well I manage daily activities. Do I meet it?',
  },
  {
    pattern: /\blife expectancy\b/i,
    question: 'This rule is about my general health outlook. Do I meet it?',
  },
  {
    pattern:
      /\b(prior|previous(ly)?|received|treated with|treatment with|therapy|chemotherapy|radiotherapy|surgery)\b/i,
    question:
      'This rule is about treatments I have had before. Does my treatment history affect it?',
  },
  {
    pattern:
      /\b(EGFR|ALK|ROS1|HER2|KRAS|NRAS|BRAF|BRCA[12]?|PD-L1|MSI|mutations?|mutated|biomarkers?|amplifi\w*|fusions?|biopsy|tissue|histolog\w*)\b/,
    question: 'This rule depends on tests on the cancer itself. Do my test results meet it?',
  },
  {
    pattern: /\b(consent|comply|compliance|willing|follow-up)\b/i,
    question: CONSENT,
  },
]

/** A plain question for the doctor about one rule, matched to the rule's verdict. */
export function doctorQuestion(criterion: CriterionVerdict): string {
  if (criterion.verdict === 'likely_fails') {
    // A false "likely fails" is the worst failure mode: always ask the doctor to confirm.
    return criterion.kind === 'inclusion'
      ? 'The check suggests I do not meet this rule. Is that right?'
      : 'The check suggests this rule keeps me out. Is that right?'
  }
  const topic = TOPICS.find((t) => t.pattern.test(criterion.text))
  if (topic !== undefined) return topic.question
  return criterion.kind === 'inclusion' ? 'Do I meet this rule?' : 'Does this rule apply to me?'
}
