import type { ComponentProps, JSX } from 'react'
import { cn } from '@/lib/utils.ts'

// shadcn/ui Label, as a plain <label>: no Radix needed for a label.
export function Label({ className, ...props }: ComponentProps<'label'>): JSX.Element {
  return (
    <label
      data-slot="label"
      className={cn('flex items-center gap-2 font-medium text-base leading-snug', className)}
      {...props}
    />
  )
}
