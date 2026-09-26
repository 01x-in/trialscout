import type { JSX } from 'react'

// The product's safety mechanism: exact copy, on every page and every printed sheet, and
// never dismissible. Do not reword it or add a close button.
export const DISCLAIMER =
  'Demo project. Not medical advice. AI picks these quotes from ClinicalTrials.gov and no clinicians have verified them.'

export function DemoCaution(): JSX.Element {
  return (
    <div role="note" aria-label="Caution" className="demo-caution">
      {DISCLAIMER}
    </div>
  )
}
