import { DurableObject } from 'cloudflare:workers'
import type { Env } from './env.ts'
import { type ClientLimiter, type Limit, RateLimiter, type Saved, type Slot } from './ratelimit.ts'

// The search rate limit on Workers: one Durable Object per client address, so every request
// from that client, on any Worker instance, counts against the same windows. A Durable
// Object handles one call at a time, and its hits are saved after each call, so they
// survive the object being evicted. The object is named by the client's address, so once
// its longest window has passed with no new hit, an alarm deletes everything it holds.

const STATE = 'limiter'
// Seconds of the longest window, for the alarm, which is not told the limits.
const SPAN = 'span'

export class SearchLimiter extends DurableObject<Env> {
  async acquire(key: string, limits: Limit[]): Promise<Slot | number> {
    const limiter = await this.#load(limits)
    const result = limiter.acquire(key)
    await this.#save(limiter.snapshot(), limits)
    return result
  }

  async release(slot: Slot, limits: Limit[]): Promise<void> {
    const limiter = await this.#load(limits)
    limiter.release(slot)
    await this.#save(limiter.snapshot(), limits)
  }

  override async alarm(): Promise<void> {
    const saved = await this.ctx.storage.get<Saved>(STATE)
    const span = (await this.ctx.storage.get<number>(SPAN)) ?? 0
    const expires = expiry(saved, span)
    if (expires === null || expires <= Date.now()) await this.ctx.storage.deleteAll()
    else await this.ctx.storage.setAlarm(expires)
  }

  async #save(saved: Saved, limits: Limit[]): Promise<void> {
    const span = Math.max(0, ...limits.map((l) => l.seconds))
    await this.ctx.storage.put({ [STATE]: saved, [SPAN]: span })
    // With no hits left, the alarm deletes at once.
    await this.ctx.storage.setAlarm(expiry(saved, span) ?? Date.now())
  }

  async #load(limits: Limit[]): Promise<RateLimiter> {
    const saved = await this.ctx.storage.get<Saved>(STATE)
    return new RateLimiter(limits, undefined, saved)
  }
}

/** Epoch milliseconds the last saved hit leaves every window; null with no hits. */
function expiry(saved: Saved | undefined, span: number): number | null {
  const hits = saved?.hits ?? []
  if (hits.length === 0) return null
  return (Math.max(...hits.map((h) => h.at)) + span) * 1000
}

/** A limiter whose counts live in one SearchLimiter object per client. */
export function durableSearchLimiter(
  namespace: DurableObjectNamespace<SearchLimiter>,
  limits: Limit[],
): ClientLimiter {
  const stub = (client: string) => namespace.get(namespace.idFromName(client))
  return {
    acquire: (client) => stub(client).acquire(client, limits),
    release: (slot) => stub(slot.key).release(slot, limits),
  }
}
