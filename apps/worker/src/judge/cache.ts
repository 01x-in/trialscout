import typia from 'typia'
import type { Answer } from './verdict.ts'

// Jev answers cached per trial and question set. The key is a SHA-256 of everything that
// shapes the answers (model, question wording, trial context, criteria, normalised profile),
// so it reveals nothing; the value holds only answers and the model that gave them.

export type CachedAnswers = { model: string; answers: Answer[] }

export interface AnswerCache {
  get(key: string): Promise<CachedAnswers | null>
  put(key: string, value: CachedAnswers): Promise<void>
}

// A week: long enough to help repeat searches, short enough that a moving model alias or
// an edited trial ages out.
const TTL_SECONDS = 7 * 24 * 60 * 60

const isCached = typia.createIs<CachedAnswers>()

export async function answerKey(parts: unknown[]): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(parts))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `jev:${hex}`
}

export function kvAnswerCache(kv: KVNamespace): AnswerCache {
  return {
    async get(key) {
      const value: unknown = await kv.get(key, 'json')
      return isCached(value) ? value : null
    },
    async put(key, value) {
      await kv.put(key, JSON.stringify(value), { expirationTtl: TTL_SECONDS })
    },
  }
}

/** An in-memory cache, for tests and tools. */
export function memoryAnswerCache(): AnswerCache {
  const store = new Map<string, CachedAnswers>()
  return {
    async get(key) {
      return store.get(key) ?? null
    },
    async put(key, value) {
      store.set(key, value)
    },
  }
}
