// When ClinicalTrials.gov is down, a search is answered from the trials saved by earlier
// searches and kept current by the daily refresh. ClinicalTrials.gov expands the patient's
// condition into synonyms; offline, a saved trial is a candidate when its conditions or
// title contain every telling word the patient typed. Jev still judges every criterion,
// including the diagnosis, so a loose candidate shows as a likely fail, never a promise.

// Words that say nothing about which cancer it is, or are written differently in trial
// conditions ("cancer" vs "carcinoma"), and joining words.
const GENERIC = new Set([
  'advanced',
  'and',
  'cancer',
  'cancers',
  'carcinoma',
  'carcinomas',
  'disease',
  'in',
  'malignancy',
  'malignant',
  'metastatic',
  'neoplasm',
  'neoplasms',
  'of',
  'stage',
  'the',
  'tumor',
  'tumors',
  'tumour',
  'tumours',
  'with',
])

/** The telling words of a condition as typed: letters and digits only, lower case. */
export function conditionTerms(condition: string): string[] {
  return condition
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 2 && !GENERIC.has(word) && !/^\d+$/.test(word))
}
