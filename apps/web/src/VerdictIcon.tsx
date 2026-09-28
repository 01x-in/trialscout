import type { JSX } from 'react'
import { type CountVerdict, VERDICT_ICONS } from './format.ts'

// A verdict's symbol in a small ring, drawn next to its words so colour is never the only
// signal. Hidden from screen readers: the words say it.
export function VerdictIcon({ verdict }: { verdict: CountVerdict }): JSX.Element {
  return (
    <span
      aria-hidden="true"
      className="grid size-5 shrink-0 place-items-center rounded-full border-2 border-current text-xs leading-none"
    >
      {VERDICT_ICONS[verdict]}
    </span>
  )
}
