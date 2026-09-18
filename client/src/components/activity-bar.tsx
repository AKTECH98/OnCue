import { AlertTriangle, Check } from 'lucide-react';

import { cn } from '@/lib/cn';
import { useConsoleStore } from '@/store/console-store';

/** The thin strip that tells the operator what the system just did. */
export function ActivityBar() {
  const result = useConsoleStore((s) => s.state?.system.latestToolResult ?? null);
  const connection = useConsoleStore((s) => s.connection);

  if (connection !== 'open') {
    return (
      <div className="flex h-8 shrink-0 items-center gap-2 border-t border-console-700 bg-console-900 px-3 text-[11px] text-preview">
        <AlertTriangle className="h-3.5 w-3.5" />
        Reconnecting to the OnCue server — manual controls are paused.
      </div>
    );
  }

  return (
    <div className="flex h-8 shrink-0 items-center gap-2 border-t border-console-700 bg-console-900 px-3">
      {result ? (
        <>
          {result.ok ? (
            <Check className="h-3.5 w-3.5 text-ready" />
          ) : (
            <AlertTriangle className="h-3.5 w-3.5 text-program" />
          )}
          <span className={cn('text-[12px]', result.ok ? 'text-console-200' : 'text-program')}>
            {result.message}
          </span>
          <span className="ml-auto font-mono text-[10px] text-console-500">
            {result.tool} · {result.durationMs}ms
          </span>
        </>
      ) : (
        <span className="text-[11px] text-console-500">
          Ready. Use the controls to rehearse the show, or say the word once voice is live.
        </span>
      )}
    </div>
  );
}
