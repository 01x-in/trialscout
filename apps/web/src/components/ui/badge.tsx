import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps, JSX } from 'react'
import { cn } from '@/lib/utils.ts'

// shadcn/ui Badge, plus one soft variant per verdict. A verdict badge always carries its
// icon and label too, so colour is never the only signal.
const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 font-medium text-sm [&>svg]:pointer-events-none [&>svg]:size-3.5',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'text-foreground',
        likely_meets: 'border-transparent bg-meets-bg text-meets',
        likely_fails: 'border-transparent bg-fails-bg text-fails',
        ask_your_doctor: 'border-transparent bg-ask-bg text-ask',
        not_checked: 'border-transparent bg-muted font-normal text-unchecked',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export function Badge({
  className,
  variant,
  ...props
}: ComponentProps<'span'> & VariantProps<typeof badgeVariants>): JSX.Element {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
}
