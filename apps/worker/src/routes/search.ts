import { typiaValidator } from '@hono/typia-validator'
import { PROBLEM_TYPES, type Profile } from '@trialscout/contract'
import { Hono } from 'hono'
import typia from 'typia'
import type { AppEnv } from '../app.ts'
import { ProblemError, problemHook } from '../problems.ts'
import { search } from '../search.ts'

const validateProfile = typia.createValidate<Profile>()

export const searchRoutes = new Hono<AppEnv>().post(
  '/',
  typiaValidator('json', validateProfile, problemHook('body')),
  async (c) => {
    // The profile is used for scoring and discarded; never log it.
    const profile = c.req.valid('json')
    const services = c.var.services
    const client = c.req.header('CF-Connecting-IP') ?? 'unknown'
    const slot = await services.limiter.acquire(client)
    if (typeof slot === 'number') {
      throw new ProblemError(
        429,
        'You have searched a lot in a short time. Please try again in a few minutes.',
        { 'Retry-After': String(Math.ceil(slot)) },
        PROBLEM_TYPES.rateLimited,
      )
    }
    try {
      return c.json(await search(services, profile))
    } catch (error) {
      // A place we could not find cost nothing, so it does not count against the limit.
      if (error instanceof ProblemError && error.status === 422)
        await services.limiter.release(slot)
      throw error
    }
  },
)
