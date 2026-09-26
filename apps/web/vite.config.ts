/// <reference types="vitest/config" />
import ttsc from '@ttsc/unplugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Default export is required by Vite. ttsc runs the Typia transform (tsconfig.app.json
// `plugins`) before React, or typia.* calls are left untransformed and throw at runtime.
// Vitest uses this config too.
export default defineConfig({
  plugins: [ttsc({ project: './tsconfig.app.json' }), react()],
  server: {
    port: 5173,
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
