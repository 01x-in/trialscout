import { evictDurableObject, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { durableSearchLimiter, type SearchLimiter } from '../src/limiter.ts'
import type { Slot } from '../src/ratelimit.ts'

const ONE_A_MINUTE = [{ count: 1, seconds: 60 }]

function isSlot(value: Slot | number): value is Slot {
  return typeof value !== 'number'
}

describe('the search limiter Durable Object', () => {
  it('limits each client on its own', async () => {
    const limiter = durableSearchLimiter(env.SEARCH_LIMITER, ONE_A_MINUTE)

    expect(isSlot(await limiter.acquire('198.51.100.1'))).toBe(true)
    expect(isSlot(await limiter.acquire('198.51.100.2'))).toBe(true)
    const wait = await limiter.acquire('198.51.100.1')
    expect(isSlot(wait)).toBe(false)
    expect(wait).toBeGreaterThan(59)
    expect(wait).toBeLessThanOrEqual(60)
  })

  it('takes back a released slot', async () => {
    const limiter = durableSearchLimiter(env.SEARCH_LIMITER, ONE_A_MINUTE)
    const slot = await limiter.acquire('198.51.100.1')
    if (!isSlot(slot)) throw new Error('Expected a slot')

    await limiter.release(slot)
    expect(isSlot(await limiter.acquire('198.51.100.1'))).toBe(true)
  })

  it('keeps its counts when the object is evicted', async () => {
    const limiter = durableSearchLimiter(env.SEARCH_LIMITER, ONE_A_MINUTE)
    await limiter.acquire('198.51.100.1')

    await evictDurableObject(env.SEARCH_LIMITER.get(env.SEARCH_LIMITER.idFromName('198.51.100.1')))
    expect(isSlot(await limiter.acquire('198.51.100.1'))).toBe(false)
  })

  it('schedules its own deletion for when the longest window has passed', async () => {
    const limiter = durableSearchLimiter(env.SEARCH_LIMITER, ONE_A_MINUTE)
    const before = Date.now()
    await limiter.acquire('198.51.100.1')

    const alarm = await runInDurableObject(stub('198.51.100.1'), (_, state) =>
      state.storage.getAlarm(),
    )
    expect(alarm).toBeGreaterThanOrEqual(before + 60_000)
    expect(alarm).toBeLessThanOrEqual(Date.now() + 60_000)
  })

  it('keeps counts still inside a window when its alarm runs early', async () => {
    const limiter = durableSearchLimiter(env.SEARCH_LIMITER, ONE_A_MINUTE)
    await limiter.acquire('198.51.100.1')

    expect(await runDurableObjectAlarm(stub('198.51.100.1'))).toBe(true)
    expect(isSlot(await limiter.acquire('198.51.100.1'))).toBe(false)
  })

  it('deletes everything it holds about a client once every hit has expired', async () => {
    const limiter = durableSearchLimiter(env.SEARCH_LIMITER, ONE_A_MINUTE)
    await limiter.acquire('198.51.100.1')
    // Move the hit two minutes into the past.
    await runInDurableObject(stub('198.51.100.1'), async (_, state) => {
      const saved = await state.storage.get<{ hits: Slot[]; nextId: number }>('limiter')
      const hits = (saved?.hits ?? []).map((h) => ({ ...h, at: h.at - 120 }))
      await state.storage.put('limiter', { hits, nextId: saved?.nextId ?? 0 })
    })

    expect(await runDurableObjectAlarm(stub('198.51.100.1'))).toBe(true)
    const left = await runInDurableObject(stub('198.51.100.1'), async (_, state) => ({
      keys: [...(await state.storage.list()).keys()],
      alarm: await state.storage.getAlarm(),
    }))
    expect(left).toEqual({ keys: [], alarm: null })
  })
})

function stub(client: string): DurableObjectStub<SearchLimiter> {
  return env.SEARCH_LIMITER.get(env.SEARCH_LIMITER.idFromName(client))
}
