import { fileURLToPath } from 'node:url'
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers'
import ttsc from '@ttsc/unplugin/vite'
import { defineConfig } from 'vitest/config'

const migrations = await readD1Migrations(fileURLToPath(new URL('./migrations', import.meta.url)))

// Default export required by Vitest. Tests run inside the Workers runtime with local D1,
// KV and Durable Objects; the Typia transform runs first, as in the build.
export default defineConfig({
  plugins: [
    ttsc({ project: './tsconfig.json' }),
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: { bindings: { TEST_MIGRATIONS: migrations } },
    }),
  ],
  test: {
    include: ['test/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
  },
})
