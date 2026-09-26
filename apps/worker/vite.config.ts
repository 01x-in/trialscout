import { cloudflare } from '@cloudflare/vite-plugin'
import ttsc from '@ttsc/unplugin/vite'
import { defineConfig } from 'vite'

// Default export required by Vite. ttsc runs the Typia transform (tsconfig.json `plugins`)
// before the Cloudflare plugin bundles the Worker, or every typia.* call throws at runtime.
export default defineConfig({
  plugins: [ttsc({ project: './tsconfig.json' }), cloudflare()],
  server: { port: 8787, strictPort: true },
})
