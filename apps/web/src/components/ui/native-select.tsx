import { ChevronDownIcon } from 'lucide-react'
import type { ComponentProps, JSX } from 'react'
import { cn } from '@/lib/utils.ts'
import { fieldClass } from './input.tsx'

// shadcn/ui NativeSelect: the browser's own menu (best on phones, and read by every screen
// reader), without its own drawing, which Safari sizes as it likes. The arrow is an icon.
export function NativeSelect({
  className,
  wrapperClassName,
  ...props
}: ComponentProps<'select'> & { wrapperClassName?: string }): JSX.Element {
  return (
    <div data-slot="native-select" className={cn('relative', wrapperClassName)}>
      <select
        className={cn(fieldClass, 'h-11 cursor-pointer appearance-none pr-10', className)}
        {...props}
      />
      <ChevronDownIcon
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  )
}
