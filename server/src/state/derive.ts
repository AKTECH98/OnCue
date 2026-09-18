import type { BroadcastState } from '@oncue/shared';

/**
 * Recomputes every value that is a pure function of the rest of the state.
 * Called after each mutation and on the show clock tick so nothing can drift.
 *
 * Schedule model: the planned clock advances by the full budget of every
 * segment the show has moved past — including skipped ones, because that time
 * was budgeted. Skipping a segment therefore genuinely buys back its duration,
 * which is what makes "we're running late" actionable.
 */
export function deriveState(state: BroadcastState, nowMs: number): BroadcastState {
  const { runOfShow } = state.show;

  state.show.elapsedSec = Math.max(0, Math.round((nowMs - state.show.startedAtMs) / 1000));

  const currentIndex = runOfShow.findIndex((segment) => segment.id === state.show.currentSegmentId);

  let plannedElapsedSec = 0;
  for (const segment of runOfShow) {
    if (segment.status === 'completed' || segment.status === 'skipped') {
      plannedElapsedSec += segment.plannedDurationSec;
    }
  }

  if (currentIndex >= 0) {
    const current = runOfShow[currentIndex]!;
    if (current.status === 'live' && current.startedAtMs !== null) {
      const inSegmentSec = Math.max(0, Math.round((nowMs - current.startedAtMs) / 1000));
      plannedElapsedSec += Math.min(inSegmentSec, current.plannedDurationSec);
    }
  }

  state.show.plannedElapsedSec = plannedElapsedSec;
  state.show.delaySec = state.show.elapsedSec - plannedElapsedSec;

  const next = runOfShow.find(
    (segment, index) =>
      index > currentIndex && (segment.status === 'upcoming' || segment.status === 'ready'),
  );
  state.show.nextSegmentId = next?.id ?? null;

  for (const camera of state.video.cameras) {
    camera.tally =
      camera.id === state.video.programCamera
        ? 'program'
        : camera.id === state.video.previewCamera
          ? 'preview'
          : 'off';
  }

  for (const mic of state.audio.microphones) {
    if (mic.state === 'muted') mic.level = 0;
    else if (mic.state === 'ready') mic.level = Math.min(mic.level, 0.15);
  }

  return state;
}

/** Seconds of scheduled programming still ahead of the operator. */
export function remainingPlannedSec(state: BroadcastState): number {
  return state.show.runOfShow
    .filter((segment) => segment.status === 'upcoming' || segment.status === 'ready')
    .reduce((total, segment) => total + segment.plannedDurationSec, 0);
}
