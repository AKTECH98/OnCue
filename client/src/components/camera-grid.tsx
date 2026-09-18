import { CameraFeed } from '@/components/camera-feed';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { useConsoleStore } from '@/store/console-store';

export function CameraGrid() {
  const cameras = useConsoleStore((s) => s.state?.video.cameras ?? []);
  const guests = useConsoleStore((s) => s.state?.speakers.guests ?? []);
  const invoke = useConsoleStore((s) => s.invoke);

  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {cameras.map((camera) => {
        const guest = guests.find((g) => g.id === camera.guestId);
        const isProgram = camera.tally === 'program';
        const isPreview = camera.tally === 'preview';

        return (
          <div
            key={camera.id}
            className={cn(
              'panel overflow-hidden transition-colors',
              isProgram && 'border-program ring-1 ring-program/40',
              isPreview && 'border-preview',
            )}
          >
            <CameraFeed guest={guest} wide={camera.guestId === null} className="aspect-video w-full">
              <div className="absolute inset-x-0 top-0 flex items-start justify-between p-1.5">
                <span className="font-mono text-[10px] font-semibold text-white/80">
                  {camera.label}
                </span>
                {isProgram ? (
                  <span className="tally-live rounded-[2px] bg-program px-1 text-[9px] font-bold tracking-widest text-white">
                    PGM
                  </span>
                ) : isPreview ? (
                  <span className="rounded-[2px] bg-preview px-1 text-[9px] font-bold tracking-widest text-console-950">
                    PVW
                  </span>
                ) : null}
              </div>
            </CameraFeed>

            <div className="flex items-center justify-between gap-1 border-t border-console-800 px-2 py-1.5">
              <span className="truncate text-[11px] text-console-300">{camera.shot}</span>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="preview"
                  active={isPreview}
                  disabled={isProgram}
                  onClick={() => void invoke('prepare_camera', { camera: camera.id })}
                >
                  Ready
                </Button>
                <Button
                  size="sm"
                  variant="program"
                  active={isProgram}
                  onClick={() => void invoke('take_camera', { camera: camera.id })}
                >
                  Take
                </Button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
