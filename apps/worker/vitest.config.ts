import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import ttsc from '@ttsc/unplugin/vite'
import { defineConfig } from 'vitest/config'

// Default export required by Vitest. Tests run inside the Workers runtime; the Typia
// transform runs first, as in the build.
export default defineConfig({
  plugins: [
    ttsc({ project: './tsconfig.json' }),
    cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' } }),
  ],
  test: {
    include: ['test/**/*.test.ts'],
  },
})
