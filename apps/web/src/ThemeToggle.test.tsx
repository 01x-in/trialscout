/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Root } from './Root.tsx'
import { THEME_KEY } from './theme.ts'

function toggle(): HTMLElement {
  return within(screen.getByRole('banner')).getByRole('button', {
    name: /^Switch to (light|dark) theme$/,
  })
}

afterEach(() => {
  delete document.documentElement.dataset.theme
  localStorage.clear()
})

describe('theme switcher', () => {
  it('follows the system theme until the viewer picks one', () => {
    render(<Root pathname="/" />)

    // jsdom reports no dark preference, so the page is light.
    expect(toggle()).toHaveAccessibleName('Switch to dark theme')
    expect(document.documentElement.dataset.theme).toBeUndefined()
    expect(localStorage.length).toBe(0)
  })

  it('switches between light and dark, and remembers only that choice', () => {
    render(<Root pathname="/about" />)

    fireEvent.click(toggle())
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(toggle()).toHaveAccessibleName('Switch to light theme')
    expect({ ...localStorage }).toEqual({ [THEME_KEY]: 'dark' })

    fireEvent.click(toggle())
    expect(document.documentElement.dataset.theme).toBe('light')
    expect({ ...localStorage }).toEqual({ [THEME_KEY]: 'light' })
  })

  it('shows the theme the page was opened with', () => {
    document.documentElement.dataset.theme = 'dark'
    render(<Root pathname="/" />)

    expect(toggle()).toHaveAccessibleName('Switch to light theme')
  })
})

describe('theme styles', () => {
  const css = readFileSync(resolve(import.meta.dirname, 'index.css'), 'utf8')
  const html = readFileSync(resolve(import.meta.dirname, '../index.html'), 'utf8')

  function block(selector: string): string {
    const at = css.indexOf(selector)
    expect(at, selector).toBeGreaterThan(-1)
    const open = css.indexOf('{', at)
    return css
      .slice(open + 1, css.indexOf('}', open))
      .replace(/\s+/g, ' ')
      .trim()
  }

  it('gives a chosen dark theme exactly the colours of the system dark theme', () => {
    expect(block(":root[data-theme='dark']")).toBe(block(":root:not([data-theme='light'])"))
  })

  // Runs index.html's inline script, as the browser does before the first paint.
  function runHeadScript(): void {
    const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1]
    expect(script, 'the inline theme script').toBeDefined()
    new Function(script ?? '')()
  }

  it.each(['light', 'dark'])('applies a saved %s pick before the first paint', (theme) => {
    localStorage.setItem(THEME_KEY, theme)
    runHeadScript()

    expect(document.documentElement.dataset.theme).toBe(theme)
  })

  it('ignores anything else saved under the key, and follows the system', () => {
    localStorage.setItem(THEME_KEY, 'purple')
    runHeadScript()

    expect(document.documentElement.dataset.theme).toBeUndefined()
  })

  // The colour tokens sit outside any @layer, and a layered rule never beats an unlayered
  // one, so the print reset must sit outside too, after the dark blocks, and match both.
  it('prints on white in every theme, the system dark one included', () => {
    const at = css.indexOf('@media print {')
    const depth = [...css.slice(0, at)].reduce(
      (d, c) => d + (c === '{' ? 1 : c === '}' ? -1 : 0),
      0,
    )
    const open = css.indexOf('{', at)
    const [selectors = '', body = ''] = css.slice(open + 1, css.indexOf('}', open)).split('{')

    expect(depth, 'the first @media print block is outside any layer').toBe(0)
    expect(at).toBeGreaterThan(css.indexOf(":root[data-theme='dark']"))
    expect(selectors.split(',').map((s) => s.trim())).toEqual(
      expect.arrayContaining([
        ':root',
        ":root:not([data-theme='light'])",
        ":root[data-theme='dark']",
      ]),
    )
    expect(body).toMatch(/color-scheme:\s*light/)
    expect(body).toMatch(/--bg:\s*#ffffff/)
  })
})
