/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import type { Profile } from '@trialscout/contract'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { searchTrials } from './api.ts'
import { App } from './App.tsx'
import { Root } from './Root.tsx'

// The privacy audit (docs/privacy.md), browser side: the profile stays in this tab's
// sessionStorage, goes only to our own /api in a request body, and the page loads nothing
// from anyone else.

const PROFILE: Profile = {
  cancerType: 'breast cancer',
  stage: 'II',
  age: 47,
  sex: 'female',
  country: 'India',
  city: 'Mumbai',
  maxDistanceKm: 100,
  notes: 'Marker zebra-7f3a',
}

describe('privacy (browser)', () => {
  it('loads no script, style, font or image from another site', () => {
    const html = readFileSync(resolve(import.meta.dirname, '../index.html'), 'utf8')
    const css = readFileSync(resolve(import.meta.dirname, 'index.css'), 'utf8')

    expect(html).not.toMatch(/(src|href)="(https?:)?\/\//i)
    // Only the two packages Vite bundles into our own stylesheet, and no url() at all.
    const imports = [...css.matchAll(/@import\s+([^;]+);/g)].map((m) => m[1]?.trim())
    expect(imports).toEqual(["'tailwindcss'", "'tw-animate-css'"])
    expect(css).not.toMatch(/url\(/i)
  })

  it('loads the landing page video, poster and captions from this site only', () => {
    render(<Root pathname="/" />)
    const urls = [...document.querySelectorAll('[src], [poster], link[href]')].flatMap((el) =>
      ['src', 'poster', 'href']
        .map((attr) => el.getAttribute(attr))
        .filter((value): value is string => value !== null && el.tagName !== 'A'),
    )

    expect(urls.length).toBeGreaterThanOrEqual(3)
    for (const url of urls)
      expect(new URL(url, window.location.origin).origin).toBe(window.location.origin)
  })

  it('serves the Geist font from this site', () => {
    const main = readFileSync(resolve(import.meta.dirname, 'main.tsx'), 'utf8')
    const fonts = readFileSync(
      createRequire(import.meta.url).resolve('@fontsource-variable/geist/index.css'),
      'utf8',
    )

    expect(main).toContain("import '@fontsource-variable/geist'")
    // Vite copies each file next to the page's own assets.
    const urls = [...fonts.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1] ?? '')
    expect(urls.length).toBeGreaterThan(0)
    for (const url of urls) expect(url).toMatch(/^['"]?\.\/files\//)
  })

  it('keeps the profile in sessionStorage only: no localStorage, no cookies', async () => {
    sessionStorage.setItem('trialscout.profile', JSON.stringify(PROFILE))
    render(<App search={async () => ({ kind: 'unavailable' })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Find trials' }))
    await screen.findByText(/could not check trials right now/i)

    expect(localStorage.length).toBe(0)
    expect(document.cookie).toBe('')
    expect(Object.keys(sessionStorage)).toEqual(['trialscout.profile'])
  })

  it('keeps nothing of the profile in localStorage: it holds only the theme choice', async () => {
    sessionStorage.setItem('trialscout.profile', JSON.stringify(PROFILE))
    render(<App search={async () => ({ kind: 'unavailable' })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Switch to dark theme' }))
    fireEvent.click(screen.getByRole('button', { name: 'Find trials' }))
    await screen.findByText(/could not check trials right now/i)

    expect({ ...localStorage }).toEqual({ 'trialscout.theme': 'dark' })
    localStorage.clear()
    delete document.documentElement.dataset.theme
  })

  it('sends the profile only to our own API, in the body, never in the URL', async () => {
    const seen: { url: string; body: string }[] = []
    await searchTrials(PROFILE, async (input, init) => {
      seen.push({ url: String(input), body: String(init?.body) })
      return new Response('{}', { status: 503 })
    })

    expect(seen).toHaveLength(1)
    const [sent] = seen
    const url = new URL(sent?.url ?? '')
    expect(url.origin).toBe(window.location.origin)
    expect(url.pathname).toBe('/api/search')
    expect(sent?.url).not.toMatch(/zebra|breast|Mumbai/i)
    expect(sent?.body).toContain('zebra-7f3a')
  })
})
