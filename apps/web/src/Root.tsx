import { type JSX, useEffect } from 'react'
import { About } from './About.tsx'
import { App } from './App.tsx'
import { Landing } from './Landing.tsx'

// Three pages, chosen by path: the landing page, the search and About. The web Worker serves
// index.html for every path that is not a file, so /search and /about need no server route.
// Links between them are plain page loads; the profile stays filled in from this tab's
// sessionStorage.

type Page = 'home' | 'search' | 'about'

function pageFor(pathname: string): Page {
  const path = pathname.replace(/\/+$/, '')
  if (path === '/search') return 'search'
  if (path === '/about') return 'about'
  return 'home'
}

const TITLES: Record<Page, string> = {
  home: 'TrialScout',
  search: 'Check trials · TrialScout',
  about: 'About this demo · TrialScout',
}

export function Root({ pathname }: { pathname: string }): JSX.Element {
  const page = pageFor(pathname)
  useEffect(() => {
    document.title = TITLES[page]
  }, [page])
  if (page === 'search') return <App />
  if (page === 'about') return <About />
  return <Landing />
}
