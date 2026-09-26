import { defineConfig } from 'drizzle-kit'

// Default export required by drizzle-kit. `npm run db:generate` writes the D1 migrations
// that Wrangler applies.
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './migrations',
})
