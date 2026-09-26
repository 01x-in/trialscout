import { Hono } from 'hono'
import typia, { type tags } from 'typia'
import { describe, expect, it, vi } from 'vitest'
import {
  fieldPaths,
  JudgeError,
  PROBLEM_JSON,
  ProblemError,
  registerProblemHandlers,
  UpstreamError,
  validOr422,
} from '../src/problems.ts'

type Paging = { page: string & tags.Pattern<'^[0-9]+$'> }
const validatePaging = typia.createValidate<Paging>()

function app(): Hono {
  const hono = new Hono()
  registerProblemHandlers(hono)
  hono.get('/boom', () => {
    throw new Error('secret internal detail')
  })
  hono.get('/teapot', () => {
    throw new ProblemError(418, 'short and stout')
  })
  hono.get('/slow-down', () => {
    throw new ProblemError(429, 'Too many.', { 'Retry-After': '30' })
  })
  hono.get('/upstream', () => {
    throw new UpstreamError('ClinicalTrials.gov search failed', {
      cause: new Error('Network connection lost.'),
    })
  })
  hono.get('/judge', () => {
    throw new JudgeError('Jev answered outside the options')
  })
  hono.get('/paged', (c) => {
    const { page } = validOr422(validatePaging(c.req.query()), 'query')
    return c.json(page)
  })
  return hono
}

async function detail(response: Response): Promise<string> {
  return ((await response.json()) as { detail: string }).detail
}

describe('Problem Details', () => {
  it('answers an unhandled exception with a generic 500', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = await app().request('/boom')

    expect(response.status).toBe(500)
    expect(response.headers.get('content-type')).toBe(PROBLEM_JSON)
    expect(await response.json()).toEqual({
      type: 'about:blank',
      title: 'Internal Server Error',
      status: 500,
      detail: 'An unexpected error occurred.',
    })
  })

  it('never leaks the internals of an unhandled exception', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const text = await (await app().request('/boom')).text()

    expect(text).not.toContain('secret internal detail')
    expect(text).not.toContain('Error:')
  })

  it('keeps the status and detail of a deliberate error', async () => {
    const response = await app().request('/teapot')

    expect(response.status).toBe(418)
    expect(response.headers.get('content-type')).toBe(PROBLEM_JSON)
    expect(await detail(response)).toBe('short and stout')
  })

  it('keeps headers such as Retry-After', async () => {
    const response = await app().request('/slow-down')

    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('30')
    expect(response.headers.get('content-type')).toBe(PROBLEM_JSON)
  })

  it('answers an unknown route with a 404', async () => {
    const response = await app().request('/does-not-exist')

    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toBe(PROBLEM_JSON)
  })

  it('answers an upstream failure with a calm 502 and logs the cause', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const response = await app().request('/upstream')

    expect(response.status).toBe(502)
    expect(await detail(response)).toBe('Trial data is unavailable right now. Try again later.')
    expect(String(warn.mock.calls[0]?.[1])).toContain('Network connection lost.')
  })

  it('answers a Jev failure with a calm 503', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const response = await app().request('/judge')

    expect(response.status).toBe(503)
    expect(await detail(response)).toBe('Trial checks are unavailable right now. Try again later.')
  })

  it('names the invalid fields of a request, validated by Typia', async () => {
    const response = await app().request('/paged?page=two')

    expect(response.status).toBe(422)
    expect(response.headers.get('content-type')).toBe(PROBLEM_JSON)
    expect(await detail(response)).toBe('Invalid request: query.page')
  })
})

describe('fieldPaths', () => {
  it.each([
    ['$input.age', 'body.age'],
    ['$input.sites[2].city', 'body.sites.2.city'],
    ['$input["odd-key"]', 'body.odd-key'],
    ['$input', 'body'],
  ])('turns %s into %s', (path, expected) => {
    expect(fieldPaths([{ path, expected: 'x', value: undefined }], 'body')).toEqual([expected])
  })

  it('lists each field once', () => {
    const errors = [
      { path: '$input.age', expected: 'number', value: 'x' },
      { path: '$input.age', expected: 'uint32', value: 'x' },
    ]
    expect(fieldPaths(errors, 'body')).toEqual(['body.age'])
  })
})
