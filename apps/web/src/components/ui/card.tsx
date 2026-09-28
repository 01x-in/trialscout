import { Slot } from '@radix-ui/react-slot'
import type { ComponentProps, JSX } from 'react'
import { cn } from '@/lib/utils.ts'

// shadcn/ui Card. `asChild` lets a card be an <article> or a labelled group.

export function Card({
  className,
  asChild = false,
  ...props
}: ComponentProps<'div'> & { asChild?: boolean }): JSX.Element {
  const Comp = asChild ? Slot : 'div'
  return (
    <Comp
      data-slot="card"
      className={cn(
        'flex flex-col gap-5 rounded-xl border bg-card py-5 text-card-foreground shadow-sm',
        className,
      )}
      {...props}
    />
  )
}

export function CardHeader({ className, ...props }: ComponentProps<'div'>): JSX.Element {
  return (
    <div
      data-slot="card-header"
      className={cn('grid auto-rows-min items-start gap-1.5 px-5', className)}
      {...props}
    />
  )
}

export function CardContent({ className, ...props }: ComponentProps<'div'>): JSX.Element {
  return <div data-slot="card-content" className={cn('px-5', className)} {...props} />
}

export function CardFooter({ className, ...props }: ComponentProps<'div'>): JSX.Element {
  return (
    <div
      data-slot="card-footer"
      className={cn('flex flex-wrap items-center gap-3 px-5', className)}
      {...props}
    />
  )
}
