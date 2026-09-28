import type { JSX } from 'react'
import { DemoCaution } from './DemoCaution.tsx'

// The top of every page: the red disclaimer strip first, then a quiet header with the
// wordmark and the About link. Both stay in view while the page scrolls; the strip is the
// only loud part.

type Page = 'search' | 'about'

export function SiteHeader({ page }: { page: Page }): JSX.Element {
  return (
    <div className="sticky top-0 z-20 print:static">
      <DemoCaution />
      <header className="border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <div className="mx-auto flex h-12 max-w-3xl items-center justify-between gap-4 px-4">
          <a
            href="/"
            className="flex items-center gap-2 font-semibold text-foreground text-lg tracking-tight no-underline"
          >
            <span
              aria-hidden="true"
              className="grid size-7 place-items-center rounded-md bg-primary font-bold text-primary-foreground text-sm"
            >
              T
            </span>
            TrialScout
          </a>
          <nav aria-label="Site">
            <a
              href="/about"
              aria-current={page === 'about' ? 'page' : undefined}
              className="rounded-md px-2 py-2 font-medium text-muted-foreground text-sm no-underline hover:text-foreground aria-[current=page]:text-foreground"
            >
              About this demo
            </a>
          </nav>
        </div>
      </header>
    </div>
  )
}
