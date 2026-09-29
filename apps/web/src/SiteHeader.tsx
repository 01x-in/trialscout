import { type JSX, type RefObject, useEffect, useRef } from 'react'
import { DemoCaution } from './DemoCaution.tsx'
import { ThemeToggle } from './ThemeToggle.tsx'

// The top of every page: the red disclaimer strip first, then a quiet header with the
// wordmark, the links and the theme switch. Both stay in view while the page scrolls; the
// strip is the only loud part.

type Page = 'home' | 'search' | 'about'

const LINK =
  'rounded-md px-2 py-2 font-medium text-muted-foreground text-sm no-underline hover:text-foreground aria-[current=page]:text-foreground'

// The strip wraps to more lines on a narrow screen, so the height of the sticky top is
// measured and published as --header-h. Anchors (scroll-padding) and the search page's
// sticky form column both clear it.
function useHeaderHeight(): RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const root = document.documentElement
    const publish = (): void => root.style.setProperty('--header-h', `${el.offsetHeight}px`)
    publish()
    if (typeof ResizeObserver === 'undefined') return () => root.style.removeProperty('--header-h')
    const observer = new ResizeObserver(publish)
    observer.observe(el)
    return () => {
      observer.disconnect()
      root.style.removeProperty('--header-h')
    }
  }, [])
  return ref
}

export function SiteHeader({ page }: { page: Page }): JSX.Element {
  const top = useHeaderHeight()
  return (
    <div ref={top} className="sticky top-0 z-20 print:static">
      <DemoCaution />
      <header className="border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <div className="mx-auto flex h-12 max-w-7xl items-center justify-between gap-4 px-4">
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
          <div className="flex items-center gap-1">
            <nav aria-label="Site" className="flex items-center">
              <a
                href="/search"
                aria-current={page === 'search' ? 'page' : undefined}
                className={LINK}
              >
                Try it now
              </a>
              <a
                href="/about"
                aria-current={page === 'about' ? 'page' : undefined}
                className={LINK}
              >
                About this demo
              </a>
            </nav>
            <ThemeToggle />
          </div>
        </div>
      </header>
    </div>
  )
}
