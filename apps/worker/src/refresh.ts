import type { Env } from './env.ts'
import type { Services, ServicesFactory } from './services.ts'
import type { RefreshCursor } from './store.ts'

// The daily cron: re-reads saved trials from ClinicalTrials.gov, least recently checked
// first, so the cache served during an outage stays current. A trial with a new version is
// saved and re-split; one no longer recruiting, no longer interventional or no longer
// listed is removed. Unchanged
// trials are only marked as checked. What a run does not reach, the next run starts with.

const RECRUITING = 'RECRUITING'

export type RefreshReport = { checked: number; changed: number; removed: number }

export async function refreshTrials(
  services: Pick<Services, 'ctgov' | 'store' | 'settings' | 'now'>,
): Promise<RefreshReport> {
  const { batchSize, maxBatches } = services.settings.refresh
  // Trials checked from here on, by this run or a search, are not due again.
  const startedAt = services.now()
  const report: RefreshReport = { checked: 0, changed: 0, removed: 0 }
  let after: RefreshCursor | null = null
  for (let batch = 0; batch < maxBatches; batch++) {
    const due = await services.store.stale({ checkedBefore: startedAt, after, limit: batchSize })
    if (due.length === 0) break
    const ids = due.map((d) => d.nctId)
    const { trials, skipped } = await services.ctgov.byIds(ids)
    const read = new Set(trials.map((t) => t.nctId))
    // A malformed study hides which number it was, so nothing counts as unlisted then.
    const unlisted = skipped === 0 ? ids.filter((id) => !read.has(id)) : []
    const closed = trials.filter((t) => t.status !== RECRUITING).map((t) => t.nctId)

    const written = await services.store.save(trials.filter((t) => t.status === RECRUITING))
    await services.store.criteriaFor(written)
    await services.store.remove([...closed, ...unlisted], startedAt)

    report.checked += trials.length + unlisted.length
    report.changed += written.length
    report.removed += closed.length + unlisted.length
    after = due.at(-1) ?? null
    if (due.length < batchSize) break
  }
  return report
}

/** The Worker's scheduled handler. It logs counts only. */
export function scheduledRefresh(
  makeServices: ServicesFactory,
): ExportedHandlerScheduledHandler<Env> {
  return async (_controller, env) => {
    const report = await refreshTrials(makeServices(env))
    console.log(
      `Trial refresh: checked ${report.checked}, changed ${report.changed}, removed ${report.removed}`,
    )
  }
}
