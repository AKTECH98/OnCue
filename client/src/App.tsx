import { useEffect } from 'react';

import { ActivityBar } from '@/components/activity-bar';
import { AudioPanel } from '@/components/audio-panel';
import { CameraGrid } from '@/components/camera-grid';
import { ConsoleHeader } from '@/components/console-header';
import { Diagnostics } from '@/components/diagnostics';
import { GraphicsPanel } from '@/components/graphics-panel';
import { GuestControls } from '@/components/guest-controls';
import { MediaPanel } from '@/components/media-panel';
import { ProgramMonitor, PreviewMonitor } from '@/components/monitors';
import { RunOfShow } from '@/components/run-of-show';
import { VoiceBar } from '@/components/voice-bar';
import { useConsoleStore } from '@/store/console-store';

export default function App() {
  const connect = useConsoleStore((s) => s.connect);
  const state = useConsoleStore((s) => s.state);
  const connection = useConsoleStore((s) => s.connection);

  useEffect(() => {
    connect();
  }, [connect]);

  if (!state) return <BootScreen connection={connection} />;

  return (
    <div className="flex h-full flex-col bg-console-950">
      <ConsoleHeader />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid gap-3 p-3 xl:grid-cols-[minmax(0,1fr)_21rem]">
          <div className="flex min-w-0 flex-col gap-3">
            <div className="grid gap-3 lg:grid-cols-[1.55fr_1fr]">
              <ProgramMonitor />
              <PreviewMonitor />
            </div>
            <CameraGrid />
            <GuestControls />
          </div>

          <aside className="flex flex-col gap-3">
            <RunOfShow />
            <AudioPanel />
            <GraphicsPanel />
            <MediaPanel />
          </aside>
        </div>
      </div>

      <VoiceBar />
      <ActivityBar />
      <Diagnostics />
    </div>
  );
}

function BootScreen({ connection }: { connection: string }) {
  const failed = connection === 'closed' || connection === 'error';

  return (
    <main className="flex h-full items-center justify-center p-6">
      <div className="panel w-full max-w-md p-8 text-center">
        <span className="mx-auto mb-4 flex h-10 w-10 items-center justify-center">
          <span className="absolute h-10 w-10 rounded-full border-[3px] border-program/40" />
          <span className="h-2.5 w-2.5 rounded-full bg-program tally-live" />
        </span>
        <h1 className="font-display text-2xl tracking-[0.15em] text-white">ONCUE</h1>
        <p className="mt-3 text-sm text-console-300">
          {failed
            ? 'Cannot reach the OnCue server.'
            : 'Loading the production state from the OnCue server…'}
        </p>
        {failed ? (
          <p className="mt-2 font-mono text-[11px] text-console-500">
            Start it with <span className="text-console-300">npm run dev</span> and this console
            will reconnect on its own.
          </p>
        ) : null}
      </div>
    </main>
  );
}
