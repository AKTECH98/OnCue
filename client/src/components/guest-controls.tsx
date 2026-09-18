import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';
import { cn } from '@/lib/cn';
import { useConsoleStore } from '@/store/console-store';

/**
 * Guest-level operations. "Ready" prepares everything for a speaker without
 * touching program; "Take" performs the full compound switch.
 */
export function GuestControls() {
  const guests = useConsoleStore((s) => s.state?.speakers.guests ?? []);
  const activeGuestId = useConsoleStore((s) => s.state?.speakers.activeGuestId ?? null);
  const preparedGuestId = useConsoleStore((s) => s.state?.speakers.preparedGuestId ?? null);
  const invoke = useConsoleStore((s) => s.invoke);

  return (
    <Panel title="Speakers" bodyClassName="space-y-1.5 p-3">
      {guests.map((guest) => {
        const isActive = guest.id === activeGuestId;
        const isPrepared = guest.id === preparedGuestId;

        return (
          <div
            key={guest.id}
            className={cn(
              'flex items-center gap-2.5 rounded border px-2 py-1.5 transition-colors',
              isActive
                ? 'border-program/60 bg-program/10'
                : isPrepared
                  ? 'border-preview/50 bg-preview/5'
                  : 'border-console-800 bg-console-850',
            )}
          >
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-console-950"
              style={{ backgroundColor: guest.tint }}
            >
              {guest.initials}
            </span>

            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[13px] text-console-200">{guest.name}</p>
              <p className="truncate text-[10px] text-console-500">
                {guest.title} · CAM {guest.cameraId} · MIC {guest.microphoneId}
              </p>
            </div>

            <div className="flex shrink-0 gap-1">
              <Button
                size="sm"
                variant="preview"
                active={isPrepared}
                disabled={isActive}
                onClick={() => void invoke('prepare_guest', { guest: guest.id })}
              >
                Ready
              </Button>
              <Button
                size="sm"
                variant="program"
                active={isActive}
                onClick={() => void invoke('take_guest', { guest: guest.id })}
              >
                Take
              </Button>
            </div>
          </div>
        );
      })}
    </Panel>
  );
}
