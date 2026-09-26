import type { SearchLimiter } from './limiter.ts'

// The API Worker's bindings, as declared in wrangler.jsonc. Validated by readConfig.
export interface Env {
  // Cached trials, split criteria and GeoNames places.
  DB: D1Database
  // Jev answers, keyed by a hash; values hold no profile content.
  CACHE: KVNamespace
  // One search rate limiter object per client address.
  SEARCH_LIMITER: DurableObjectNamespace<SearchLimiter>
  // Secrets.
  TYPESAFE_API_KEY?: string
  // Vars; see config.ts for defaults.
  TYPESAFE_MODEL?: string
  CTGOV_BASE_URL?: string
  SEARCH_PER_MINUTE?: string
  SEARCH_PER_DAY?: string
  TRIAL_CHECKS_PER_MINUTE?: string
  TRIAL_CHECKS_PER_DAY?: string
}
