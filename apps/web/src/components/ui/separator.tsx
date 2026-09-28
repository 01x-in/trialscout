import type { ComponentProps, JSX } from 'react'
import { cn } from '@/lib/utils.ts'

// shadcn/ui Separator, decorative only, so it needs no Radix.
export function Separator({ className, ...props }: ComponentProps<'div'>): JSX.Element {
  return (
    <div
      data-slot="separator"
      role="none"
      className={cn('h-px w-full shrink-0 bg-border', className)}
      {...props}
    />
  )
}
