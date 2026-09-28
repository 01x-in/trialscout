import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps, JSX } from 'react'
import { cn } from '@/lib/utils.ts'

// shadcn/ui Alert: a callout box with an optional leading icon. Unlike shadcn's, it has no
// role of its own: most callouts here are not urgent, so the caller picks one if needed.
const alertVariants = cva(
  'relative grid w-full grid-cols-[0_1fr] items-start gap-y-1 rounded-lg border px-4 py-3 text-base has-[>svg]:grid-cols-[1.125rem_1fr] has-[>svg]:gap-x-3 [&>svg]:size-[1.125rem] [&>svg]:translate-y-0.5',
  {
    variants: {
      variant: {
        default: 'bg-card text-card-foreground [&>svg]:text-primary',
        muted: 'border-transparent bg-muted text-foreground [&>svg]:text-primary',
        destructive: 'border-2 border-destructive bg-fails-bg text-foreground',
        ask: 'border-transparent border-l-4 border-l-ask bg-muted text-foreground',
        fails: 'border-transparent bg-fails-bg font-semibold text-fails',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export function Alert({
  className,
  variant,
  ...props
}: ComponentProps<'div'> & VariantProps<typeof alertVariants>): JSX.Element {
  return <div data-slot="alert" className={cn(alertVariants({ variant }), className)} {...props} />
}

export function AlertTitle({ className, ...props }: ComponentProps<'p'>): JSX.Element {
  return (
    <p
      data-slot="alert-title"
      className={cn('col-start-2 font-semibold leading-snug', className)}
      {...props}
    />
  )
}

export function AlertDescription({ className, ...props }: ComponentProps<'div'>): JSX.Element {
  return (
    <div
      data-slot="alert-description"
      className={cn('col-start-2 grid justify-items-start gap-1 [&_p]:leading-relaxed', className)}
      {...props}
    />
  )
}
