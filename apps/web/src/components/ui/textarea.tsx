import type { ComponentProps, JSX } from 'react'
import { cn } from '@/lib/utils.ts'
import { fieldClass } from './input.tsx'

export function Textarea({ className, ...props }: ComponentProps<'textarea'>): JSX.Element {
  return (
    <textarea
      data-slot="textarea"
      className={cn(fieldClass, 'min-h-28 resize-y py-2', className)}
      {...props}
    />
  )
}
