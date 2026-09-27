import type { CriterionVerdict } from '@trialscout/contract'

// Plain questions for the doctor, from templates in code: Jev cannot write text (M1.3). The
// patterns below only pick a topic; the question itself uses everyday words, and medical
// terms appear only in the quoted rule shown next to it. Topics are tried in order, so a
// rule about blood tests that mentions spread is still about blood tests. Gene names are
// matched case-sensitively, so "EGFR" (a gene) is not read as "eGFR" (a kidney test).
//
// Past treatment is told apart from treatment in general: "prior osimertinib" or "received"
// is about the patient's history, but "not suitable for surgery" is not. So history words
// come before the stage and the spread of the cancer ("prior therapy for metastatic
// disease" is about treatment), and bare treatment names come after them. Spread to the
// brain or spine is checked earlier: that is the point of any rule that mentions it.

type Topic = { pattern: RegExp; question: string }

const CONSENT = 'This rule is about the steps the study asks of people. What would they involve?'
const TREATMENTS =
  'This rule is about treatments I have had before. Does my treatment history affect it?'
const SPREAD = 'This rule is about where the cancer has spread. Does it apply to me?'

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
  // A list of many conditions, before any one of them (infection, heart disease) decides.
  {
    pattern:
      /\b(systemic (diseases?|illness(es)?)|intercurrent illness(es)?|serious (medical|underlying) (conditions?|illness(es)?)|comorbidit(y|ies))\b/i,
    question: 'This rule is about other health problems I may have. Does it apply to me?',
  },
  {
    pattern: /\b(HIV|hepatitis|infections?|tuberculosis)\b/i,
    question: 'This rule is about infections I have or have had. Does it apply to me?',
  },
  {
    pattern:
      /\b(ULN|upper limit of normal|h(a)?emoglobin|neutrophils?|platelets?|creatinine|bilirubin|AST|ALT|ANC|albumin|leukocytes?|laborator\w*|lab values?|blood counts?)\b/i,
    question: 'This rule depends on blood test results. Do my latest results meet it?',
  },
  {
    pattern: /\b(measurable|evaluable|RECIST)\b/i,
    question: 'This rule depends on what my scans show. Do my scans meet it?',
  },
  {
    pattern: /\b(brain|CNS|leptomeningeal|spinal cord compression)\b/i,
    question: SPREAD,
  },
  {
    pattern:
      /\b(cardiac|heart|QTc?|ECG|LVEF|echocardiogram|ejection fraction|myocardial|arrhythmi\w*|hepatic|liver function|renal|kidney)\b/i,
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
  // History words. "Prior to randomization" only dates something, so it does not count.
  {
    pattern:
      /\b(prior(?! to\b)|previous(ly)?|received|treated with|treatment with|progress(ed|ion)? on|lines? of (therapy|treatment))\b/i,
    question: TREATMENTS,
  },
  {
    pattern: /\b(stage\s+(0|I{1,3}V?|IV|[1-4])[A-C]?|locally advanced|unresectable)\b/i,
    question: 'This rule is about the stage of the cancer. Does my stage meet it?',
  },
  // "Metastatic setting" says when a treatment was given, not where the cancer has spread.
  {
    pattern: /\b((oligo)?metasta\w*\b(?!\s+setting)|spread)/i,
    question: SPREAD,
  },
  {
    pattern:
      /\b(EGFR|ALK|ROS1|HER2|KRAS|NRAS|BRAF|BRCA[12]?|PD-L1|MSI|mutations?|mutated|biomarkers?|amplifi\w*|fusions?|biopsy|tissue|histolog\w*)\b/,
    question: 'This rule depends on tests on the cancer itself. Do my test results meet it?',
  },
  // Treatments named without a history word, e.g. "Major surgery within 4 weeks". Radiation
  // pneumonitis is a lung problem, not a treatment.
  {
    pattern:
      /\b(therapy|chemotherapy|immunotherapy|radiotherapy|radiation(?!\s+pneumonitis)|surgery|major surgical|anti-?cancer|investigational (agents?|compounds?)|corticosteroids?|vaccines?)\b/i,
    question: TREATMENTS,
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
