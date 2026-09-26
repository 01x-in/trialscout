import { type JSX, useEffect } from 'react'
import { About } from './About.tsx'
import { App } from './App.tsx'

// Two pages, chosen by path. The web Worker serves index.html for every path that is not a
// file, so /about needs no server route. Links between them are plain page loads; the
// profile stays filled in from this tab's sessionStorage.

function isAbout(pathname: string): boolean {
  return pathname.replace(/\/+$/, '') === '/about'
}

export function Root({ pathname }: { pathname: string }): JSX.Element {
  const about = isAbout(pathname)
  useEffect(() => {
    document.title = about ? 'About this demo · TrialScout' : 'TrialScout'
  }, [about])
  return about ? <About /> : <App />
}
