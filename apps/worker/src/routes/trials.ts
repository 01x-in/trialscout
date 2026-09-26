import { typiaValidator } from '@hono/typia-validator'
import { PROBLEM_TYPES, type Profile } from '@trialscout/contract'
import { Hono } from 'hono'
import typia, { type tags } from 'typia'
import type { AppEnv } from '../app.ts'
import { ProblemError, problemHook, validOr422 } from '../problems.ts'
import { trialVerdicts } from '../trial-verdicts.ts'

// POST, not GET: the profile travels in the body, never in a URL that could be logged.
// The path is checked in the handler, not by typiaValidator, so the tagged type stays out of
// the declarations the web app's hc<AppType> reads.

type TrialPath = { nctId: string & tags.Pattern<'^NCT[0-9]{8}$'> }

const validatePath = typia.createValidate<TrialPath>()
const validateProfile = typia.createValidate<Profile>()

export const trialRoutes = new Hono<AppEnv>().post(
  '/:nctId/verdicts',
  typiaValidator('json', validateProfile, problemHook('body')),
  async (c) => {
    // The profile is used for scoring and discarded; never log it.
    const profile = c.req.valid('json')
    const { nctId } = validOr422(validatePath({ nctId: c.req.param('nctId') }), 'path')
    const services = c.var.services
    // Counted apart from searches, and only when Jev is asked: cached checks are free.
    const client = `trial:${c.req.header('CF-Connecting-IP') ?? 'unknown'}`
    const beforeJev = async (): Promise<void> => {
      const slot = await services.trialLimiter.acquire(client)
      if (typeof slot === 'number') {
        throw new ProblemError(
          429,
          'You have checked a lot of trials in a short time. Please try again in a few minutes.',
          { 'Retry-After': String(Math.ceil(slot)) },
          PROBLEM_TYPES.rateLimited,
        )
      }
    }
    return c.json(await trialVerdicts(services, nctId, profile, beforeJev))
  },
)
