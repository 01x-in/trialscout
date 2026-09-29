// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { route, type WebEnv } from './index.ts'

function fetcher(name: string, seen: string[]): Fetcher {
  return {
    fetch: async (input: RequestInfo | URL) => {
      seen.push(`${name} ${new URL(input instanceof Request ? input.url : String(input)).pathname}`)
      return new Response(name)
    },
    connect: () => {
      throw new Error('Not used')
    },
  } as Fetcher
}

function env(seen: string[]): WebEnv {
  return { API: fetcher('api', seen), ASSETS: fetcher('assets', seen) }
}

describe('the web Worker', () => {
  it('sends /api requests to the API Worker on the same origin', async () => {
    const seen: string[] = []
    const response = await route(new Request('https://trialscout.test/api/search'), env(seen))

    expect(await response.text()).toBe('api')
    expect(seen).toEqual(['api /api/search'])
  })

  it('keeps the client address the rate limit is keyed on', async () => {
    let forwarded: string | null = null
    const api = {
      fetch: async (input: RequestInfo | URL) => {
        forwarded = input instanceof Request ? input.headers.get('CF-Connecting-IP') : null
        return new Response('api')
      },
    } as Fetcher
    const request = new Request('https://trialscout.test/api/search', {
      method: 'POST',
      headers: { 'CF-Connecting-IP': '203.0.113.7' },
    })
    await route(request, { API: api, ASSETS: fetcher('assets', []) })

    expect(forwarded).toBe('203.0.113.7')
  })

  it('serves everything else from the static build', async () => {
    const seen: string[] = []
    const response = await route(new Request('https://trialscout.test/'), env(seen))

    expect(await response.text()).toBe('assets')
    expect(seen).toEqual(['assets /'])
  })

  it('does not treat a path that only starts with "api" as the API', async () => {
    const seen: string[] = []
    await route(new Request('https://trialscout.test/apiary'), env(seen))

    expect(seen).toEqual(['assets /apiary'])
  })

  describe('the demo video, which Safari only plays if the server answers Range requests', () => {
    const BYTES = new Uint8Array([10, 11, 12, 13, 14, 15, 16, 17, 18, 19])

    /** Static assets as Cloudflare serves them: the whole file, whatever Range says. */
    function assets(seen: Request[] = []): WebEnv {
      const fetch = async (input: RequestInfo | URL): Promise<Response> => {
        seen.push(input instanceof Request ? input : new Request(input))
        return new Response(BYTES, {
          headers: { 'Content-Type': 'video/mp4', ETag: '"abc"', 'Cache-Control': 'public' },
        })
      }
      return { API: fetcher('api', []), ASSETS: { fetch } as Fetcher }
    }

    async function get(range: string | null, method = 'GET', seen: Request[] = []) {
      const headers = range === null ? undefined : { Range: range }
      return route(
        new Request('https://trialscout.test/demo/trialscout-demo.mp4', { method, headers }),
        assets(seen),
      )
    }

    it('answers a byte range with 206 and just those bytes', async () => {
      const response = await get('bytes=0-1')

      expect(response.status).toBe(206)
      expect(response.headers.get('Content-Range')).toBe('bytes 0-1/10')
      expect(response.headers.get('Content-Length')).toBe('2')
      expect(response.headers.get('Content-Type')).toBe('video/mp4')
      expect(response.headers.get('Accept-Ranges')).toBe('bytes')
      expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([10, 11])
    })

    it.each([
      ['bytes=4-', 'bytes 4-9/10', [14, 15, 16, 17, 18, 19]],
      ['bytes=-3', 'bytes 7-9/10', [17, 18, 19]],
      ['bytes=8-100', 'bytes 8-9/10', [18, 19]],
    ])('handles %s', async (range, contentRange, expected) => {
      const response = await get(range)

      expect(response.status).toBe(206)
      expect(response.headers.get('Content-Range')).toBe(contentRange)
      expect([...new Uint8Array(await response.arrayBuffer())]).toEqual(expected)
    })

    it('says a range past the end cannot be satisfied', async () => {
      const response = await get('bytes=10-20')

      expect(response.status).toBe(416)
      expect(response.headers.get('Content-Range')).toBe('bytes */10')
    })

    it.each(['bytes=5-2', 'items=0-1', 'bytes=abc', 'bytes=0-1,4-5'])(
      'serves the whole file for a range it will not honour: %s',
      async (range) => {
        const response = await get(range)

        expect(response.status).toBe(200)
        expect(response.headers.get('Accept-Ranges')).toBe('bytes')
        expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([...BYTES])
      },
    )

    it('serves the whole file, and says it takes ranges, when none is asked for', async () => {
      const response = await get(null)

      expect(response.status).toBe(200)
      expect(response.headers.get('Accept-Ranges')).toBe('bytes')
      expect(response.headers.get('ETag')).toBe('"abc"')
      expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([...BYTES])
    })

    it('answers HEAD with the headers and no body', async () => {
      const response = await get('bytes=0-1', 'HEAD')

      expect(response.status).toBe(206)
      expect(response.headers.get('Content-Range')).toBe('bytes 0-1/10')
      expect(await response.text()).toBe('')
    })

    it('asks the static assets for the whole file, never a range', async () => {
      const seen: Request[] = []
      await get('bytes=0-1', 'GET', seen)

      expect(seen).toHaveLength(1)
      expect(seen[0]?.headers.get('Range')).toBeNull()
    })

    it('passes a missing file through untouched', async () => {
      const missing: WebEnv = {
        API: fetcher('api', []),
        ASSETS: {
          fetch: async (): Promise<Response> => new Response('gone', { status: 404 }),
          connect: () => {
            throw new Error('Not used')
          },
        } as Fetcher,
      }
      const response = await route(
        new Request('https://trialscout.test/demo/nope.mp4', { headers: { Range: 'bytes=0-1' } }),
        missing,
      )

      expect(response.status).toBe(404)
    })

    it('leaves every other path alone, whatever its Range header', async () => {
      const seen: string[] = []
      await route(
        new Request('https://trialscout.test/assets/index.js', { headers: { Range: 'bytes=0-1' } }),
        env(seen),
      )

      expect(seen).toEqual(['assets /assets/index.js'])
    })
  })
})
