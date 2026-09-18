import { Activity, MicOff, RotateCcw, Wifi, WifiOff } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { formatClock, formatDelay } from '@/lib/format';
import { useConsoleStore } from '@/store/console-store';

export function ConsoleHeader() {
  const show = useConsoleStore((s) => s.state?.show ?? null);
  const connection = useConsoleStore((s) => s.connection);
  const simulatedVoice = useConsoleStore((s) => s.simulatedVoice);
  const resetShow = useConsoleStore((s) => s.resetShow);
  const toggleDiagnostics = useConsoleStore((s) => s.toggleDiagnostics);

  const connected = connection === 'open';
  const late = (show?.delaySec ?? 0) > 15;

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-console-700 bg-console-900 px-3 sm:px-4">
      <div className="flex items-center gap-2.5">
        <span className="relative flex h-6 w-6 items-center justify-center">
          <span className="absolute inset-0 rounded-full border-[3px] border-program" />
          <span className="h-1.5 w-1.5 rounded-full bg-program" />
        </span>
        <span className="font-display text-xl leading-none tracking-[0.18em] text-white">
          ONCUE
        </span>
      </div>

      <span
        className={cn(
          'rounded-sm px-2 py-0.5 text-[10px] font-bold tracking-[0.2em]',
          show?.onAir ? 'tally-live bg-program text-white' : 'bg-console-700 text-console-300',
        )}
      >
        {show?.onAir ? 'ON AIR' : 'OFF AIR'}
      </span>

      <div className="hidden min-w-0 flex-col leading-tight sm:flex">
        <span className="truncate text-[11px] text-console-300">{show?.eventTitle ?? '—'}</span>
        <span className="label-caps">Live production</span>
      </div>

      <div className="ml-auto flex items-center gap-3 sm:gap-4">
        <div className="text-right leading-tight">
          <p className="font-mono text-lg tabular-nums text-white">
            {formatClock(show?.elapsedSec ?? 0)}
          </p>
          <p className={cn('text-[10px]', late ? 'text-preview' : 'text-console-500')}>
            {formatDelay(show?.delaySec ?? 0)}
          </p>
        </div>

        <div className="hidden items-center gap-3 border-l border-console-700 pl-3 md:flex">
          <Status
            icon={connected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
            label={connected ? 'Link' : 'No link'}
            tone={connected ? 'ok' : 'bad'}
          />
          <Status
            icon={<MicOff className="h-3.5 w-3.5" />}
            label={simulatedVoice ? 'Voice sim' : 'Higgs'}
            tone="idle"
          />
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={toggleDiagnostics}
          aria-label="Toggle orchestration diagnostics"
          title="Orchestration diagnostics"
        >
          <Activity className="h-4 w-4" />
        </Button>

        <Button variant="outline" size="md" onClick={resetShow} title="Restore the rehearsal state">
          <RotateCcw className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Reset</span>
        </Button>
      </div>
    </header>
  );
}

function Status({
  icon,
  label,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  tone: 'ok' | 'bad' | 'idle';
}) {
  return (
    <span
      className={cn(
        'flex items-center gap-1.5 text-[11px]',
        tone === 'ok' && 'text-ready',
        tone === 'bad' && 'text-program',
        tone === 'idle' && 'text-console-400',
      )}
    >
      {icon}
      {label}
    </span>
  );
}
