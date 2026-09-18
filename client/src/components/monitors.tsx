import type { Guest, LowerThird } from '@oncue/shared';

import { CameraFeed } from '@/components/camera-feed';
import { cn } from '@/lib/cn';
import { useConsoleStore } from '@/store/console-store';

function useCameraSubject(cameraId: number | null): { guest: Guest | undefined; wide: boolean } {
  const state = useConsoleStore((s) => s.state);
  const camera = state?.video.cameras.find((c) => c.id === cameraId);
  const guest = state?.speakers.guests.find((g) => g.id === camera?.guestId);
  return { guest, wide: camera?.guestId === null };
}

export function ProgramMonitor() {
  const programCamera = useConsoleStore((s) => s.state?.video.programCamera ?? null);
  const lowerThird = useConsoleStore((s) => s.state?.graphics.current ?? null);
  const activeGuestId = useConsoleStore((s) => s.state?.speakers.activeGuestId ?? null);
  const activeGuest = useConsoleStore((s) =>
    s.state?.speakers.guests.find((g) => g.id === activeGuestId),
  );
  const { guest, wide } = useCameraSubject(programCamera);

  return (
    <figure className="panel relative flex flex-col overflow-hidden border-program/50 ring-1 ring-program/25">
      <CameraFeed guest={guest} wide={wide} className="aspect-video w-full">
        <div className="absolute left-3 top-3 flex items-center gap-2">
          <span className="tally-live rounded-sm bg-program px-2 py-0.5 text-[10px] font-bold tracking-[0.2em] text-white">
            LIVE
          </span>
          <span className="font-mono text-[11px] text-white/70">CAM {programCamera ?? '--'}</span>
        </div>
        <div className="absolute right-3 top-3 font-mono text-[11px] text-white/50">PGM</div>
        {lowerThird ? <LowerThirdBug lowerThird={lowerThird} /> : null}
      </CameraFeed>
      <figcaption className="flex items-center justify-between border-t border-console-800 bg-console-900 px-3 py-2">
        <span className="label-caps text-program">Program</span>
        <span className="text-xs text-console-300">
          {activeGuest ? `${activeGuest.name} — ${activeGuest.title}` : 'No active speaker'}
        </span>
      </figcaption>
    </figure>
  );
}

export function PreviewMonitor() {
  const previewCamera = useConsoleStore((s) => s.state?.video.previewCamera ?? null);
  const preparedLowerThird = useConsoleStore((s) => s.state?.graphics.prepared ?? null);
  const preparedGuestId = useConsoleStore((s) => s.state?.speakers.preparedGuestId ?? null);
  const preparedGuest = useConsoleStore((s) =>
    s.state?.speakers.guests.find((g) => g.id === preparedGuestId),
  );
  const { guest, wide } = useCameraSubject(previewCamera);

  return (
    <figure className="panel relative flex flex-col overflow-hidden border-preview/40">
      {previewCamera === null ? (
        <div className="flex aspect-video w-full items-center justify-center bg-console-950">
          <p className="text-xs text-console-500">Nothing in preview</p>
        </div>
      ) : (
        <CameraFeed guest={guest} wide={wide} className="aspect-video w-full">
          <div className="absolute left-3 top-3 flex items-center gap-2">
            <span className="rounded-sm border border-preview/70 bg-preview/15 px-2 py-0.5 text-[10px] font-bold tracking-[0.2em] text-preview">
              PVW
            </span>
            <span className="font-mono text-[11px] text-white/60">CAM {previewCamera}</span>
          </div>
          {preparedLowerThird ? (
            <LowerThirdBug lowerThird={preparedLowerThird} prepared />
          ) : null}
        </CameraFeed>
      )}
      <figcaption className="flex items-center justify-between border-t border-console-800 bg-console-900 px-3 py-2">
        <span className="label-caps text-preview">Preview</span>
        <span className="text-xs text-console-300">
          {preparedGuest ? `${preparedGuest.name} prepared` : 'Standing by'}
        </span>
      </figcaption>
    </figure>
  );
}

function LowerThirdBug({
  lowerThird,
  prepared = false,
}: {
  lowerThird: LowerThird;
  prepared?: boolean;
}) {
  return (
    <div
      className={cn(
        'absolute bottom-[8%] left-0 max-w-[75%] border-l-4 py-1.5 pl-3 pr-5 backdrop-blur-sm',
        prepared
          ? 'border-preview bg-console-950/55 opacity-75'
          : 'border-program bg-console-950/80',
      )}
    >
      <p className="font-display text-base leading-tight tracking-wide text-white">
        {lowerThird.name}
      </p>
      <p className="text-[11px] leading-tight text-console-300">
        {lowerThird.title} · {lowerThird.organization}
      </p>
    </div>
  );
}
