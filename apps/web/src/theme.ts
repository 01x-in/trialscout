// Light or dark. The page follows the system setting until the viewer picks one; the pick is
// kept in localStorage, the only thing this site keeps there, and never anything from the
// profile (privacy.test.tsx). index.html applies it before the first paint.

export const THEME_KEY = 'trialscout.theme'

export type Theme = 'light' | 'dark'

/** The theme on screen now: the viewer's pick, or else the system's. */
export function currentTheme(): Theme {
  const picked = document.documentElement.dataset.theme
  if (picked === 'light' || picked === 'dark') return picked
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function chooseTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    // Storage blocked: the pick still holds for this page.
  }
}
