import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps, JSX } from 'react'
import { cn } from '@/lib/utils.ts'

// shadcn/ui Button. Every size keeps a 44px touch target, and focus uses the page's
// own solid ring (index.css) rather than shadcn's faint one.
const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer no-underline touch-manipulation items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-60 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-xs hover:bg-primary/90',
        outline:
          'border border-input bg-card text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline underline-offset-4',
      },
      size: {
        default: 'h-11 px-5 text-base has-[>svg]:px-4',
        // Smaller text and padding, but still a 44px touch target.
        sm: 'h-11 gap-1.5 px-3 text-sm has-[>svg]:px-2.5',
        lg: 'h-12 px-6 text-base has-[>svg]:px-5',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonProps): JSX.Element {
  const Comp = asChild ? Slot : 'button'
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}
