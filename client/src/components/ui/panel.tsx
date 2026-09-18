import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

interface PanelProps {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
  bodyClassName?: string;
}

export function Panel({ title, children, action, className, bodyClassName }: PanelProps) {
  return (
    <section className={cn('panel flex min-h-0 flex-col', className)}>
      <header className="flex h-8 shrink-0 items-center justify-between border-b border-console-800 px-3">
        <h2 className="label-caps">{title}</h2>
        {action}
      </header>
      <div className={cn('min-h-0 flex-1 overflow-y-auto p-3', bodyClassName)}>{children}</div>
    </section>
  );
}
