import { describe, expect, it } from 'vitest'
import { conditionTerms } from '../src/fallback.ts'

describe('conditionTerms', () => {
  it.each([
    ['non-small cell lung cancer', ['non', 'small', 'cell', 'lung']],
    ['Breast Cancer', ['breast']],
    ['  Metastatic colorectal carcinoma ', ['colorectal']],
    ['glioblastoma', ['glioblastoma']],
    ['B-cell non-Hodgkin lymphoma', ['cell', 'non', 'hodgkin', 'lymphoma']],
    ['HER2+ breast cancer, stage 2', ['her2', 'breast']],
    ['cancer of the pancreas', ['pancreas']],
    ["Kaposi's sarcoma", ['kaposi', 'sarcoma']],
    ['cancer', []],
    ['%_', []],
  ])('%s → %j', (input, expected) => {
    expect(conditionTerms(input)).toEqual(expected)
  })
})
