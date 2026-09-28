import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DISCLAIMER } from './DemoCaution.tsx'
import { Root } from './Root.tsx'

describe('site header', () => {
  it.each(['/', '/about'])('on %s, comes right after the exact disclaimer strip', (path) => {
    render(<Root pathname={path} />)
    const strip = screen.getByRole('note', { name: 'Caution' })
    const header = screen.getByRole('banner')

    expect(strip.textContent).toBe(DISCLAIMER)
    // The strip stays first on the page: the header never comes before it.
    expect(strip.compareDocumentPosition(header) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(header).getByRole('link', { name: 'TrialScout' })).toHaveAttribute('href', '/')
  })

  it('links to About from the search, and marks it as the current page on About', () => {
    const { unmount } = render(<Root pathname="/" />)
    const about = within(screen.getByRole('banner')).getByRole('link', { name: 'About this demo' })
    expect(about).toHaveAttribute('href', '/about')
    expect(about).not.toHaveAttribute('aria-current')
    unmount()

    render(<Root pathname="/about" />)
    expect(
      within(screen.getByRole('banner')).getByRole('link', { name: 'About this demo' }),
    ).toHaveAttribute('aria-current', 'page')
  })
})
