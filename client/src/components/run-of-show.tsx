import type { SegmentStatus } from '@oncue/shared';
import { SkipForward } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';
import { cn } from '@/lib/cn';
import { formatDuration } from '@/lib/format';
import { useConsoleStore } from '@/store/console-store';

const STATUS_STYLES: Record<SegmentStatus, { dot: string; row: string; label: string }> = {
  completed: { dot: 'bg-console-500', row: 'opacity-45', label: 'Done' },
  live: { dot: 'bg-program tally-live', row: 'border-program/60 bg-program/10', label: 'Live' },
  ready: { dot: 'bg-preview', row: 'border-preview/50 bg-preview/5', label: 'Ready' },
  upcoming: { dot: 'bg-console-600', row: '', label: '' },
  skipped: { dot: 'bg-console-700', row: 'opacity-40', label: 'Skipped' },
};

export function RunOfShow() {
  const runOfShow = useConsoleStore((s) => s.state?.show.runOfShow ?? []);
  const guests = useConsoleStore((s) => s.state?.speakers.guests ?? []);
  const invoke = useConsoleStore((s) => s.invoke);

  return (
    <Panel
      title="Run of Show"
      action={
        <Button size="sm" variant="ghost" onClick={() => void invoke('advance_run_of_show')}>
          Next
        </Button>
      }
      bodyClassName="p-2"
    >
      <ol className="space-y-1">
        {runOfShow.map((segment, index) => {
          const style = STATUS_STYLES[segment.status];
          const guest = guests.find((g) => g.id === segment.guestId);
          const canSkip = segment.status === 'upcoming' || segment.status === 'ready';

          return (
            <li
              key={segment.id}
              className={cn(
                'group flex items-center gap-2.5 rounded border border-transparent px-2 py-1.5 transition-colors',
                style.row,
              )}
            >
              <span className="w-3 shrink-0 text-right font-mono text-[10px] text-console-500">
                {index + 1}
              </span>
              <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', style.dot)} />

              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    'truncate text-[13px] leading-tight',
                    segment.status === 'live' ? 'font-semibold text-white' : 'text-console-200',
                    segment.status === 'skipped' && 'line-through',
                  )}
                >
                  {segment.title}
                </p>
                {guest ? (
                  <p className="truncate text-[10px] text-console-500">{guest.name}</p>
                ) : null}
              </div>

              <span className="shrink-0 font-mono text-[10px] text-console-500">
                {formatDuration(segment.plannedDurationSec)}
              </span>

              {style.label ? (
                <span
                  className={cn(
                    'shrink-0 text-[9px] font-semibold uppercase tracking-wider',
                    segment.status === 'live' && 'text-program',
                    segment.status === 'ready' && 'text-preview',
                    (segment.status === 'completed' || segment.status === 'skipped') &&
                      'text-console-500',
                  )}
                >
                  {style.label}
                </span>
              ) : null}

              {canSkip ? (
                <button
                  type="button"
                  aria-label={`Skip ${segment.title}`}
                  className="shrink-0 text-console-600 opacity-0 transition hover:text-program focus-visible:opacity-100 group-hover:opacity-100"
                  onClick={() => void invoke('skip_segment', { segment: segment.id })}
                >
                  <SkipForward className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}
