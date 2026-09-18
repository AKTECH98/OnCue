import { X } from 'lucide-react';

import { cn } from '@/lib/cn';
import { useConsoleStore } from '@/store/console-store';

/**
 * Development-only view of the orchestration layer: every request, the
 * LangGraph node path it took, and how long it took. Hidden by default so the
 * demo view stays clean.
 */
export function Diagnostics() {
  const open = useConsoleStore((s) => s.diagnosticsOpen);
  const toggle = useConsoleStore((s) => s.toggleDiagnostics);
  const traces = useConsoleStore((s) => s.traces);
  const connection = useConsoleStore((s) => s.connection);
  const simulatedVoice = useConsoleStore((s) => s.simulatedVoice);
  const revision = useConsoleStore((s) => s.state?.revision ?? 0);

  if (!open) return null;

  return (
    <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-console-700 bg-console-900 shadow-2xl">
      <header className="flex h-10 shrink-0 items-center justify-between border-b border-console-700 px-3">
        <h2 className="label-caps">Orchestration diagnostics</h2>
        <button
          type="button"
          onClick={toggle}
          aria-label="Close diagnostics"
          className="text-console-400 hover:text-console-200"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <dl className="grid grid-cols-3 gap-px border-b border-console-700 bg-console-700 font-mono text-[11px]">
        <Stat label="Link" value={connection} />
        <Stat label="Voice" value={simulatedVoice ? 'simulated' : 'higgs'} />
        <Stat label="Revision" value={String(revision)} />
      </dl>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {traces.length === 0 ? (
          <p className="p-4 text-[12px] text-console-500">
            No operations traced yet. Every tool request will appear here with the LangGraph node
            path it walked.
          </p>
        ) : (
          <ol className="divide-y divide-console-800">
            {traces.map((trace) => (
              <li key={trace.id} className="space-y-1 px-3 py-2">
                <div className="flex items-baseline gap-2">
                  <span
                    className={cn(
                      'font-mono text-[12px]',
                      trace.ok ? 'text-console-200' : 'text-program',
                    )}
                  >
                    {trace.operation}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-console-500">
                    {trace.source}
                  </span>
                  <span className="ml-auto font-mono text-[10px] text-console-500">
                    {trace.durationMs}ms
                  </span>
                </div>
                <p className={cn('text-[12px]', trace.ok ? 'text-console-300' : 'text-program/90')}>
                  {trace.message}
                </p>
                <p className="font-mono text-[10px] text-console-500">{trace.path.join(' › ')}</p>
                {Object.keys(trace.args).length > 0 ? (
                  <p className="font-mono text-[10px] text-console-600">
                    {JSON.stringify(trace.args)}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </div>
    </aside>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-console-900 px-3 py-2">
      <dt className="label-caps">{label}</dt>
      <dd className="text-console-200">{value}</dd>
    </div>
  );
}
