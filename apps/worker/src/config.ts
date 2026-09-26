import typia, { type tags } from 'typia'

// Wrangler vars and secrets arrive as strings; every one is validated here with Typia.
// Typia does not transform, so trimming and defaults happen below in plain code.

// Not blank: at least one non-space character.
type NotBlank = tags.Pattern<'\\S'>

type Vars = {
  TYPESAFE_API_KEY?: string
  TYPESAFE_MODEL?: string & NotBlank
}

export type Config = {
  // Null when no key is configured; Jev calls then fail with a JudgeError.
  typesafeApiKey: string | null
  typesafeModel: string
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
  }
}
