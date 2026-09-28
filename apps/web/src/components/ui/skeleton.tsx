import type { ComponentProps, JSX } from 'react'
import { cn } from '@/lib/utils.ts'

// shadcn/ui Skeleton. The pulse stops for anyone who asks for less motion.
export function Skeleton({ className, ...props }: ComponentProps<'div'>): JSX.Element {
  return (
    <div
      data-slot="skeleton"
      className={cn('animate-pulse rounded-md bg-muted motion-reduce:animate-none', className)}
      {...props}
    />
  )
}
