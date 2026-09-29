import { MoonIcon, SunIcon } from 'lucide-react'
import { type JSX, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button.tsx'
import { chooseTheme, currentTheme } from './theme.ts'

// One button in the header: it names the theme it switches to, and shows its icon.
export function ThemeToggle(): JSX.Element {
  const [theme, setTheme] = useState(currentTheme)

  // Until the viewer picks, the page follows the system, which can change while it is open.
  useEffect(() => {
    const system = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (system === undefined) return
    const follow = (): void => setTheme(currentTheme())
    system.addEventListener('change', follow)
    return () => system.removeEventListener('change', follow)
  }, [])

  const next = theme === 'dark' ? 'light' : 'dark'
  return (
    <Button
      type="button"
      variant="ghost"
      className="w-11 px-0 text-muted-foreground hover:text-foreground"
      aria-label={`Switch to ${next} theme`}
      onClick={() => {
        chooseTheme(next)
        setTheme(next)
      }}
    >
      {next === 'light' ? <SunIcon aria-hidden="true" /> : <MoonIcon aria-hidden="true" />}
    </Button>
  )
}
