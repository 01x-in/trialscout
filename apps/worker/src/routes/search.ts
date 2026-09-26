import { typiaValidator } from '@hono/typia-validator'
import type { Profile } from '@trialscout/contract'
import { Hono } from 'hono'
import typia from 'typia'

const validateProfile = typia.createValidate<Profile>()

export const searchRoutes = new Hono().post('/', typiaValidator('json', validateProfile), (c) => {
  // The profile is used for scoring and discarded; never log it.
  c.req.valid('json')
  return c.json({ detail: 'Search is not built yet (M1.10).' }, 501)
})
