/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import ttsc from '@ttsc/unplugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Default export is required by Vite. ttsc runs the Typia transform (tsconfig.app.json
// `plugins`) before React, or typia.* calls are left untransformed and throw at runtime.
// Vitest uses this config too.
export default defineConfig({
  plugins: [ttsc({ project: './tsconfig.app.json' }), tailwindcss(), react()],
  // `@/` is src/, as in tsconfig.app.json `paths`: shadcn/ui components import through it.
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    // PORT lets a preview tool pick a free port; 5173 otherwise.
    port: Number(process.env.PORT ?? 5173),
    // The API Worker from `make dev-worker`, unless API_URL points elsewhere.
    proxy: {
      '/api': process.env.API_URL ?? 'http://127.0.0.1:8787',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'worker/**/*.test.ts'],
  },
})
