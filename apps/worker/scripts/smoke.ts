// Smoke-tests a deployment (M4): the pages, the disclaimer, a bad request, and one live
// search and opened trial with a made-up profile. Exits non-zero if any check fails.
//
//   make smoke URL=https://trialscout.cc

import { smoke } from './lib/smoke.ts'

const baseUrl = process.argv[2]
if (!baseUrl) throw new Error('Usage: node scripts/smoke.ts <https://your-site>')

const result = await smoke(baseUrl, (input, init) => fetch(input, init))
for (const line of result.lines) console.log(line)
console.log(result.ok ? 'Smoke test passed.' : 'Smoke test FAILED.')
if (!result.ok) process.exitCode = 1
