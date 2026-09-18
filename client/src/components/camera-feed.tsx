import type { Guest } from '@oncue/shared';
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

interface CameraFeedProps {
  guest: Guest | undefined;
  /** Wide shots frame the whole stage instead of a single subject. */
  wide?: boolean;
  className?: string;
  children?: ReactNode;
}

/**
 * A believable stand-in for a real camera feed: studio backdrop, a lit subject
 * silhouette and stage lighting. No video decoding, no streaming.
 */
export function CameraFeed({ guest, wide = false, className, children }: CameraFeedProps) {
  const tint = guest?.tint ?? '#64748b';

  return (
    <div
      className={cn(
        'relative isolate overflow-hidden bg-console-950',
        'after:pointer-events-none after:absolute after:inset-0 after:bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(0,0,0,0.75)_100%)]',
        className,
      )}
    >
      <div
        className="absolute inset-0 opacity-70"
        style={{
          background: `radial-gradient(ellipse 70% 55% at 50% 18%, ${tint}38 0%, transparent 62%), linear-gradient(180deg, #0d1219 0%, #070a0f 100%)`,
        }}
      />

      <div
        className="absolute inset-x-0 bottom-0 h-1/3 opacity-40"
        style={{ background: `linear-gradient(0deg, ${tint}22, transparent)` }}
      />

      {/* Stage floor line */}
      <div className="absolute inset-x-0 bottom-[22%] h-px bg-white/5" />

      {wide ? <WideStage tint={tint} /> : <Subject tint={tint} initials={guest?.initials ?? '--'} />}

      {/* Sensor grain keeps the frame from looking like flat CSS */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07] mix-blend-overlay"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, rgba(255,255,255,0.6) 0px, rgba(255,255,255,0.6) 1px, transparent 1px, transparent 3px)',
        }}
      />

      <div className="absolute inset-0 z-10">{children}</div>
    </div>
  );
}

function Subject({ tint, initials }: { tint: string; initials: string }) {
  return (
    <div className="absolute inset-0 flex items-end justify-center">
      <div className="relative flex h-[76%] w-[42%] min-w-[90px] flex-col items-center justify-end">
        <div
          className="h-[38%] w-[62%] rounded-full"
          style={{
            background: `linear-gradient(160deg, ${tint}cc, ${tint}55)`,
            boxShadow: `0 0 40px -6px ${tint}77`,
          }}
        />
        <div
          className="-mt-[6%] h-[58%] w-full rounded-t-[45%]"
          style={{ background: `linear-gradient(180deg, ${tint}99, ${tint}22)` }}
        />
        <span className="font-display absolute top-[8%] text-lg tracking-widest text-white/75">
          {initials}
        </span>
      </div>
    </div>
  );
}

function WideStage({ tint }: { tint: string }) {
  return (
    <div className="absolute inset-0 flex items-end justify-center gap-[6%] px-[12%] pb-[20%]">
      {[0.58, 0.72, 0.62].map((height, index) => (
        <div
          key={index}
          className="flex w-[18%] flex-col items-center justify-end"
          style={{ height: `${height * 100}%` }}
        >
          <div
            className="h-[34%] w-[58%] rounded-full"
            style={{ background: `linear-gradient(160deg, ${tint}aa, ${tint}44)` }}
          />
          <div
            className="-mt-[5%] h-[60%] w-full rounded-t-[45%]"
            style={{ background: `linear-gradient(180deg, ${tint}77, ${tint}18)` }}
          />
        </div>
      ))}
    </div>
  );
}
