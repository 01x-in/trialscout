import { describe, expect, it } from 'vitest'
import { readConfig } from '../src/config.ts'

describe('readConfig (Typia)', () => {
  it('uses defaults when nothing is set', () => {
    expect(readConfig({})).toEqual({ typesafeApiKey: null, typesafeModel: 'jev-latest' })
  })

  it('trims the API key and model', () => {
    expect(readConfig({ TYPESAFE_API_KEY: ' key-123 ', TYPESAFE_MODEL: ' jev-1.14.0 ' })).toEqual({
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

  it('rejects a secret of the wrong type without printing its value', () => {
    expect(() => readConfig({ TYPESAFE_API_KEY: 12345 })).toThrow(
      /^Invalid Worker config: TYPESAFE_API_KEY$/,
    )
  })
})
