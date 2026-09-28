import type { ComponentProps, JSX } from 'react'
import { cn } from '@/lib/utils.ts'

// shadcn/ui Input, Textarea and NativeSelect. 44px tall, 16px text (no zoom on iPhone), a
// --control border that reaches 3:1, and a thicker red edge when invalid.
export const fieldClass =
  'w-full min-w-0 rounded-md border border-input bg-background px-3 text-base text-foreground shadow-xs transition-colors placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive'

export function Input({ className, type, ...props }: ComponentProps<'input'>): JSX.Element {
  return (
    <input type={type} data-slot="input" className={cn(fieldClass, 'h-11', className)} {...props} />
  )
}
