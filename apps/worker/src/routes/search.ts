import { typiaValidator } from '@hono/typia-validator'
import type { Profile } from '@trialscout/contract'
import { Hono } from 'hono'
import typia from 'typia'
import type { AppEnv } from '../app.ts'
import { ProblemError, problemHook } from '../problems.ts'

const validateProfile = typia.createValidate<Profile>()

export const searchRoutes = new Hono<AppEnv>().post(
  '/',
  typiaValidator('json', validateProfile, problemHook('body')),
  (c) => {
    // The profile is used for scoring and discarded; never log it.
    c.req.valid('json')
    throw new ProblemError(501, 'Search is not built yet.')
  },
)
