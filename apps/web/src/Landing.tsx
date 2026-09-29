import type { JSX } from 'react'
import { Button } from '@/components/ui/button.tsx'
import { SiteHeader } from './SiteHeader.tsx'

export function Landing(): JSX.Element {
  return (
    <>
      <SiteHeader page="home" />
      <main className="mx-auto max-w-5xl px-4 pt-10 pb-16 [overflow-wrap:break-word]">
        <h1 className="text-balance font-semibold text-3xl tracking-tight sm:text-4xl">
          Which cancer trials are worth asking your doctor about?
        </h1>
        <Button asChild size="lg" className="mt-6">
          <a href="/search">Try it now</a>
        </Button>
      </main>
    </>
  )
}
