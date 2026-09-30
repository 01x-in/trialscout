import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DISCLAIMER } from './DemoCaution.tsx'
import { Root } from './Root.tsx'

function nav(): ReturnType<typeof within> {
  return within(screen.getByRole('banner'))
}

describe('site header', () => {
  it.each(['/', '/search', '/about'])(
    'on %s, comes right after the exact disclaimer strip',
    (path) => {
      render(<Root pathname={path} />)
      const strip = screen.getByRole('note', { name: 'Caution' })
      const header = screen.getByRole('banner')

      expect(strip.textContent).toBe(DISCLAIMER)
      // The strip stays first on the page: the header never comes before it.
      expect(strip.compareDocumentPosition(header) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(within(header).getByRole('link', { name: 'TrialScout' })).toHaveAttribute('href', '/')
    },
  )

  it('links to the search and to About, and marks the page you are on', () => {
    const { unmount } = render(<Root pathname="/" />)
    expect(nav().getByRole('link', { name: 'Try it now' })).toHaveAttribute('href', '/search')
    expect(nav().getByRole('link', { name: 'Try it now' })).not.toHaveAttribute('aria-current')
    expect(nav().getByRole('link', { name: 'About this demo' })).toHaveAttribute('href', '/about')
    expect(nav().getByRole('link', { name: 'About this demo' })).not.toHaveAttribute('aria-current')
    unmount()

    const search = render(<Root pathname="/search" />)
    expect(nav().getByRole('link', { name: 'Try it now' })).toHaveAttribute('aria-current', 'page')
    expect(nav().getByRole('link', { name: 'About this demo' })).not.toHaveAttribute('aria-current')
    search.unmount()

    render(<Root pathname="/about" />)
    expect(nav().getByRole('link', { name: 'About this demo' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(nav().getByRole('link', { name: 'Try it now' })).not.toHaveAttribute('aria-current')
  })

  it('tells the page how tall the sticky top is, so anchors and the form column clear it', () => {
    let notify: () => void = () => undefined
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          notify = callback
        }
        observe(): void {}
        disconnect(): void {}
        unobserve(): void {}
      },
    )
    try {
      const { unmount } = render(<Root pathname="/about" />)
      const top = screen.getByRole('banner').parentElement as HTMLElement
      Object.defineProperty(top, 'offsetHeight', { configurable: true, value: 117 })
      notify()

      expect(document.documentElement.style.getPropertyValue('--header-h')).toBe('117px')
      unmount()
      expect(document.documentElement.style.getPropertyValue('--header-h')).toBe('')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
