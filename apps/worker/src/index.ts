import { createApp } from './app.ts'

const app = createApp()

// Default export required by the Workers runtime.
export default {
  fetch: app.fetch,
} satisfies ExportedHandler
