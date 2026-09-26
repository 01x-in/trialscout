import { DISCLAIMER } from '@trialscout/contract'
import type { JSX } from 'react'

// The product's safety mechanism: exact copy (in @trialscout/contract), on every page and
// every printed sheet, and never dismissible. Do not add a close button.
export { DISCLAIMER }

export function DemoCaution(): JSX.Element {
  return (
    <div role="note" aria-label="Caution" className="demo-caution">
      {DISCLAIMER}
    </div>
  )
}
