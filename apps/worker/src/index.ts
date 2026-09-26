import { createApp } from './app.ts'
import type { Env } from './env.ts'
import { scheduledRefresh } from './refresh.ts'
import { workerServices } from './services.ts'

export { SearchLimiter } from './limiter.ts'

const app = createApp(workerServices)

// Default export required by the Workers runtime.
export default {
  fetch: app.fetch,
  // The daily trial refresh (wrangler.jsonc triggers).
  scheduled: scheduledRefresh(workerServices),
} satisfies ExportedHandler<Env>
