import typia, { type tags } from 'typia'
import { CTGOV_BASE_URL } from './clients/ctgov-query.ts'

// Wrangler vars and secrets arrive as strings; every one is validated here with Typia.
// Typia does not transform, so trimming and defaults happen below in plain code.

// Not blank: at least one non-space character.
type NotBlank = tags.Pattern<'\\S'>
// A whole number from 1 up, as Wrangler vars are strings.
type Count = string & tags.Pattern<'^\\s*[1-9][0-9]*\\s*$'>

type Vars = {
  TYPESAFE_API_KEY?: string
  TYPESAFE_MODEL?: string & NotBlank
  CTGOV_BASE_URL?: string & tags.Format<'uri'>
  SEARCH_PER_MINUTE?: Count
  SEARCH_PER_DAY?: Count
}

export type Config = {
  // Null when no key is configured; Jev calls then fail with a JudgeError.
  typesafeApiKey: string | null
  typesafeModel: string
  ctgovBaseUrl: string
  // Searches each client may make; every search calls ClinicalTrials.gov and Jev live.
  searchPerMinute: number
  searchPerDay: number
}

const validateVars = typia.createValidate<Vars>()

/** The Worker's config from its bindings; throws naming each invalid variable, never its value. */
export function readConfig(bindings: object): Config {
  const result = validateVars(bindings)
  if (!result.success) {
    const names = [...new Set(result.errors.map((e) => e.path.replace(/^\$input\./, '')))]
    throw new Error(`Invalid Worker config: ${names.join(', ')}`)
  }
  const vars = result.data
  const key = vars.TYPESAFE_API_KEY?.trim() ?? ''
  return {
    typesafeApiKey: key === '' ? null : key,
    typesafeModel: vars.TYPESAFE_MODEL?.trim() ?? 'jev-latest',
    ctgovBaseUrl: vars.CTGOV_BASE_URL ?? CTGOV_BASE_URL,
    searchPerMinute: Number(vars.SEARCH_PER_MINUTE ?? 5),
    searchPerDay: Number(vars.SEARCH_PER_DAY ?? 50),
  }
}
