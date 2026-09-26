import { Hono } from 'hono'
import type { Env } from './env.ts'
import { registerProblemHandlers } from './problems.ts'
import { searchRoutes } from './routes/search.ts'
import { trialRoutes } from './routes/trials.ts'
import type { Services, ServicesFactory } from './services.ts'

export type AppEnv = { Bindings: Env; Variables: { services: Services } }

// Return type inferred on purpose: it carries the route types that `hc<AppType>` reads.
export function createApp(makeServices: ServicesFactory) {
  const app = new Hono<AppEnv>()
  registerProblemHandlers(app)
  // Invalid config fails every API request with a 500 rather than running half-configured.
  app.use('/api/*', async (c, next) => {
    c.set('services', makeServices(c.env))
    await next()
  })
  return app.route('/api/search', searchRoutes).route('/api/trials', trialRoutes)
}

// The API's route types, for the web app's `hc<AppType>` client.
export type AppType = ReturnType<typeof createApp>
