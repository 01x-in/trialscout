.PHONY: install dev dev-worker dev-web test test-worker test-web lint format db-local db-generate check-deploy deploy

install:
	npm install

# Run the API Worker and the web app: make -j2 dev
dev: dev-worker dev-web

# The API Worker on :8787 (Vite + Cloudflare plugin, so Typia is transformed). Secrets: apps/worker/.dev.vars
dev-worker:
	cd apps/worker && npm run dev < /dev/null

# Vite on :5173, /api proxied to the API Worker
dev-web:
	cd apps/web && npm run dev < /dev/null

test: test-worker test-web

test-worker:
	cd apps/worker && npm test

test-web:
	cd apps/web && npm test

lint:
	npm run format:check && npm run lint && npm run typecheck

format:
	npm run format

# Local D1: apply migrations, then import GeoNames cities (downloads ~3 MB on first run)
db-local:
	cd apps/worker && npm run db:migrate:local
	cd apps/worker && npm run db:cities

# Regenerate D1 migrations after changing apps/worker/src/db/schema.ts
db-generate:
	cd apps/worker && npm run db:generate

# Build both Workers and run `wrangler deploy --dry-run` on each; deploys nothing
check-deploy:
	cd apps/worker && npm run check:deploy
	cd apps/web && npm run check:deploy

# Deploy the API Worker, then the web Worker that calls it
deploy:
	cd apps/worker && npm run deploy
	cd apps/web && npm run deploy
