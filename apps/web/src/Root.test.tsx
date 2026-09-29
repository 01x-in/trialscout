import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Root } from './Root.tsx'

describe('routes', () => {
  it('serves the landing page at /', () => {
    render(<Root pathname="/" />)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Which cancer trials are worth asking your doctor about?',
    )
    expect(screen.queryByRole('button', { name: 'Find trials' })).not.toBeInTheDocument()
    expect(document.title).toBe('TrialScout')
  })

  it.each(['/search', '/search/'])('serves the form at %s', (path) => {
    render(<Root pathname={path} />)

    expect(screen.getByRole('button', { name: 'Find trials' })).toBeInTheDocument()
    expect(document.title).toBe('Check trials · TrialScout')
  })

  it('serves About at /about', () => {
    render(<Root pathname="/about" />)

    expect(screen.getByRole('heading', { level: 1, name: 'About this demo' })).toBeInTheDocument()
    expect(document.title).toBe('About this demo · TrialScout')
  })

  it('shows the landing page for a path it does not know', () => {
    render(<Root pathname="/nope" />)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/worth asking your doctor/)
    expect(document.title).toBe('TrialScout')
  })
})
