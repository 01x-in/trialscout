// The API Worker's bindings, as declared in wrangler.jsonc. Validated by readConfig.
export interface Env {
  // Cached trials, split criteria and GeoNames places.
  DB: D1Database
  // Jev answers, keyed by a hash; values hold no profile content.
  CACHE: KVNamespace
  // Secrets.
  TYPESAFE_API_KEY?: string
  // Vars; see config.ts for defaults.
  TYPESAFE_MODEL?: string
  CTGOV_BASE_URL?: string
}
