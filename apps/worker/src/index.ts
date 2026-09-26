import { createApp } from './app.ts'
import type { Env } from './env.ts'

const app = createApp()

// Default export required by the Workers runtime.
export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Env>
