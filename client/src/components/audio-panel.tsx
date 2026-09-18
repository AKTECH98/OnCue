import type { MicrophoneState } from '@oncue/shared';
import { Music2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';
import { cn } from '@/lib/cn';
import { useConsoleStore } from '@/store/console-store';

const MIC_STATES: { value: MicrophoneState; label: string }[] = [
  { value: 'live', label: 'Live' },
  { value: 'ready', label: 'Ready' },
  { value: 'muted', label: 'Mute' },
];

export function AudioPanel() {
  const microphones = useConsoleStore((s) => s.state?.audio.microphones ?? []);
  const musicLevel = useConsoleStore((s) => s.state?.audio.musicLevel ?? 0);
  const guests = useConsoleStore((s) => s.state?.speakers.guests ?? []);
  const invoke = useConsoleStore((s) => s.invoke);

  return (
    <Panel title="Audio" bodyClassName="space-y-2.5 p-3">
      {microphones.map((mic) => {
        const guest = guests.find((g) => g.id === mic.guestId);
        return (
          <div key={mic.id} className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-baseline gap-2">
                <span className="font-mono text-[11px] font-semibold text-console-200">
                  {mic.label}
                </span>
                <span className="truncate text-[11px] text-console-500">
                  {guest?.name ?? 'Unassigned'}
                </span>
              </div>
              <div className="flex gap-1">
                {MIC_STATES.map(({ value, label }) => (
                  <Button
                    key={value}
                    size="sm"
                    variant={value === 'live' ? 'program' : value === 'ready' ? 'preview' : 'default'}
                    active={mic.state === value}
                    onClick={() =>
                      void invoke('set_microphone', { microphone: mic.id, state: value })
                    }
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>
            <MicMeter state={mic.state} level={mic.level} />
          </div>
        );
      })}

      <div className="space-y-1.5 border-t border-console-800 pt-2.5">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[11px] text-console-300">
            <Music2 className="h-3.5 w-3.5 text-console-500" />
            Music bed
          </span>
          <span className="font-mono text-[11px] text-console-200">{musicLevel}</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={musicLevel}
          aria-label="Music level"
          onChange={(event) => void invoke('set_music', { level: Number(event.target.value) })}
          className="h-1 w-full cursor-pointer appearance-none rounded-full bg-console-700 accent-signal outline-none"
        />
      </div>
    </Panel>
  );
}

/** Presentation-only jitter so a live mic looks alive. Never touches state. */
function useLiveLevel(state: MicrophoneState, base: number): number {
  const [level, setLevel] = useState(base);

  useEffect(() => {
    if (state === 'muted') {
      setLevel(0);
      return;
    }
    const swing = state === 'live' ? 0.22 : 0.05;
    const id = setInterval(() => {
      setLevel(Math.max(0, Math.min(1, base + (Math.random() - 0.45) * swing * 2)));
    }, 140);
    return () => clearInterval(id);
  }, [state, base]);

  return level;
}

function MicMeter({ state, level: baseLevel }: { state: MicrophoneState; level: number }) {
  const segments = 16;
  const level = useLiveLevel(state, baseLevel);
  const litCount = state === 'muted' ? 0 : Math.round(level * segments);

  return (
    <div className="flex h-1.5 gap-[2px]" aria-hidden>
      {Array.from({ length: segments }, (_, index) => (
        <span
          key={index}
          className={cn(
            'flex-1 rounded-[1px] transition-colors',
            index < litCount
              ? state === 'live'
                ? index > segments - 4
                  ? 'bg-program'
                  : 'bg-ready'
                : 'bg-preview/70'
              : 'bg-console-800',
          )}
        />
      ))}
    </div>
  );
}
