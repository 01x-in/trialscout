import { cloudflare } from '@cloudflare/vite-plugin'
import ttsc from '@ttsc/unplugin/vite'
import { defineConfig } from 'vite'

// Default export required by Vite. ttsc runs the Typia transform (tsconfig.json `plugins`)
// before the Cloudflare plugin bundles the Worker, or every typia.* call throws at runtime.
export default defineConfig({
  plugins: [ttsc({ project: './tsconfig.json' }), cloudflare()],
  server: {
    // 127.0.0.1, not localhost: the web app's /api proxy targets it; localhost may be IPv6 only.
    host: '127.0.0.1',
    port: 8787,
    strictPort: true,
    // With a file watcher, @ttsc/unplugin 0.30.4 deadlocks module loading in the Cloudflare
    // dev runner (every request hangs). Without one it works; restart `make dev` after
    // editing the Worker.
    watch: null,
  },
})
