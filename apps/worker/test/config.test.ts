import { describe, expect, it } from 'vitest'
import { CTGOV_BASE_URL } from '../src/clients/ctgov-query.ts'
import { readConfig } from '../src/config.ts'

describe('readConfig (Typia)', () => {
  it('uses defaults when nothing is set', () => {
    expect(readConfig({})).toEqual({
      typesafeApiKey: null,
      typesafeModel: 'jev-latest',
      ctgovBaseUrl: CTGOV_BASE_URL,
    })
  })

  it('trims the API key and model', () => {
    expect(
      readConfig({ TYPESAFE_API_KEY: ' key-123 ', TYPESAFE_MODEL: ' jev-1.14.0 ' }),
    ).toMatchObject({
      typesafeApiKey: 'key-123',
      typesafeModel: 'jev-1.14.0',
    })
  })

  it('treats a blank API key as not configured', () => {
    expect(readConfig({ TYPESAFE_API_KEY: '   ' }).typesafeApiKey).toBeNull()
  })

  it('ignores bindings that are not config', () => {
    expect(readConfig({ DB: {}, CACHE: {} }).typesafeModel).toBe('jev-latest')
  })

  it('rejects a blank model, naming the variable', () => {
    expect(() => readConfig({ TYPESAFE_MODEL: '  ' })).toThrow(
      'Invalid Worker config: TYPESAFE_MODEL',
    )
  })

  it('reads a ClinicalTrials.gov base URL and rejects one that is not a URL', () => {
    expect(readConfig({ CTGOV_BASE_URL: 'https://ctgov.test/api/v2' }).ctgovBaseUrl).toBe(
      'https://ctgov.test/api/v2',
    )
    expect(() => readConfig({ CTGOV_BASE_URL: 'not a url' })).toThrow(
      'Invalid Worker config: CTGOV_BASE_URL',
    )
  })

  it('rejects a secret of the wrong type without printing its value', () => {
    expect(() => readConfig({ TYPESAFE_API_KEY: 12345 })).toThrow(
      /^Invalid Worker config: TYPESAFE_API_KEY$/,
    )
  })
})
