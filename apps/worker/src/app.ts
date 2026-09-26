import { Hono } from 'hono'
import { searchRoutes } from './routes/search.ts'

export function createApp() {
  return new Hono().route('/api/search', searchRoutes)
}

// The API's route types, for the web app's `hc<AppType>` client.
export type AppType = ReturnType<typeof createApp>
