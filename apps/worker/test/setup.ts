import { applyD1Migrations, reset } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { beforeEach } from 'vitest'

// Every test starts with empty storage and the current schema.
beforeEach(async () => {
  await reset()
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
})
