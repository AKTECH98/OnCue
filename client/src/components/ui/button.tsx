import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 rounded font-semibold uppercase tracking-wider whitespace-nowrap transition-colors select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/70 disabled:pointer-events-none disabled:opacity-40',
  {
    variants: {
      variant: {
        default:
          'bg-console-700 text-console-200 hover:bg-console-600 active:bg-console-500 border border-console-600',
        program:
          'bg-program/15 text-program border border-program/60 hover:bg-program/25 active:bg-program/35',
        preview:
          'bg-preview/10 text-preview border border-preview/50 hover:bg-preview/20 active:bg-preview/30',
        ghost: 'text-console-300 hover:bg-console-800 hover:text-console-200 border border-transparent',
        outline: 'border border-console-600 text-console-300 hover:border-console-500 hover:text-console-200',
      },
      size: {
        sm: 'h-7 px-2.5 text-[10px]',
        md: 'h-9 px-3 text-[11px]',
        lg: 'h-11 px-4 text-xs',
        icon: 'h-8 w-8',
      },
      active: {
        true: '',
        false: '',
      },
    },
    compoundVariants: [
      { variant: 'program', active: true, class: 'bg-program text-white border-program' },
      { variant: 'preview', active: true, class: 'bg-preview text-console-950 border-preview' },
      { variant: 'default', active: true, class: 'bg-console-500 text-white border-console-400' },
    ],
    defaultVariants: { variant: 'default', size: 'md', active: false },
  },
);

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'color'>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, active, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size, active }), className)} {...props} />;
}

export { buttonVariants };
