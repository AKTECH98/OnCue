import { useEffect } from 'react';

import { useConsoleStore } from '@/store/console-store';

const CONNECTION_COPY: Record<string, string> = {
  connecting: 'Connecting to the OnCue server…',
  open: 'Connected',
  closed: 'Server unreachable — retrying',
  error: 'Connection error — retrying',
};

export default function App() {
  const connect = useConsoleStore((s) => s.connect);
  const connection = useConsoleStore((s) => s.connection);
  const state = useConsoleStore((s) => s.state);

  useEffect(() => {
    connect();
  }, [connect]);

  return (
    <main className="flex min-h-full items-center justify-center p-6">
      <div className="panel w-full max-w-lg p-8">
        <p className="label-caps">OnCue</p>
        <h1 className="font-display mt-1 text-3xl tracking-wide text-white">
          Broadcast control online
        </h1>
        <p className="mt-2 text-sm text-console-300">
          Phase 0 foundation — client, server and shared domain types are wired together.
        </p>

        <dl className="mt-6 space-y-2 font-mono text-xs">
          <Row label="Server link" value={CONNECTION_COPY[connection] ?? connection} />
          <Row label="Event" value={state?.show.eventTitle ?? '—'} />
          <Row
            label="Current segment"
            value={
              state?.show.runOfShow.find((s) => s.id === state.show.currentSegmentId)?.title ?? '—'
            }
          />
          <Row label="Program" value={state ? `CAM ${state.video.programCamera}` : '—'} />
          <Row label="State revision" value={state ? String(state.revision) : '—'} />
        </dl>
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-console-800 pb-2">
      <dt className="text-console-400">{label}</dt>
      <dd className="text-console-200">{value}</dd>
    </div>
  );
}
