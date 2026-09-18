import type {
  BroadcastState,
  CameraId,
  Guest,
  LowerThird,
  MicrophoneId,
  MicrophoneState,
  Segment,
} from '@oncue/shared';

/**
 * Low-level, deterministic mutations over a state draft.
 *
 * These are the only place production rules live. Phase 2 wraps them in
 * validated domain tools; nothing above this layer pokes at fields directly.
 */

export function findGuest(state: BroadcastState, reference: string): Guest | undefined {
  const needle = reference.trim().toLowerCase();
  if (!needle) return undefined;
  return state.speakers.guests.find(
    (guest) =>
      guest.id === needle ||
      guest.name.toLowerCase() === needle ||
      guest.aliases.some((alias) => alias === needle) ||
      guest.name.toLowerCase().startsWith(needle),
  );
}

export function findSegment(state: BroadcastState, reference: string): Segment | undefined {
  const needle = reference.trim().toLowerCase();
  if (!needle) return undefined;
  return state.show.runOfShow.find(
    (segment) =>
      segment.id === needle ||
      segment.title.toLowerCase() === needle ||
      segment.title.toLowerCase().includes(needle),
  );
}

export function lowerThirdFor(guest: Guest): LowerThird {
  return {
    guestId: guest.id,
    name: guest.name,
    title: guest.title,
    organization: guest.organization,
  };
}

export function setPreviewCamera(state: BroadcastState, cameraId: CameraId): void {
  state.video.previewCamera = cameraId;
}

export function setProgramCamera(state: BroadcastState, cameraId: CameraId): void {
  const previousProgram = state.video.programCamera;
  state.video.programCamera = cameraId;
  if (state.video.previewCamera === cameraId) {
    state.video.previewCamera = previousProgram === cameraId ? null : previousProgram;
  }
}

export function setMicrophone(
  state: BroadcastState,
  microphoneId: MicrophoneId,
  micState: MicrophoneState,
): void {
  const mic = state.audio.microphones.find((m) => m.id === microphoneId);
  if (!mic) return;
  mic.state = micState;
  mic.level = micState === 'live' ? 0.6 : micState === 'ready' ? 0.1 : 0;
}

export function setMusicLevel(state: BroadcastState, level: number): void {
  state.audio.musicLevel = Math.round(Math.min(100, Math.max(0, level)));
}

export function showLowerThird(state: BroadcastState, lowerThird: LowerThird): void {
  state.graphics.current = lowerThird;
  if (state.graphics.prepared?.guestId === lowerThird.guestId) state.graphics.prepared = null;
}

export function hideLowerThird(state: BroadcastState): void {
  state.graphics.current = null;
}

/** Marks a segment live, completing whatever was live before it. */
export function activateSegment(state: BroadcastState, segmentId: string, nowMs: number): void {
  for (const segment of state.show.runOfShow) {
    if (segment.status === 'live' && segment.id !== segmentId) {
      segment.status = 'completed';
      segment.endedAtMs = nowMs;
    }
  }
  const target = state.show.runOfShow.find((segment) => segment.id === segmentId);
  if (!target) return;
  target.status = 'live';
  target.startedAtMs = nowMs;
  target.endedAtMs = null;
  state.show.currentSegmentId = target.id;
}

export function prepareSegment(state: BroadcastState, segmentId: string): void {
  for (const segment of state.show.runOfShow) {
    if (segment.status === 'ready' && segment.id !== segmentId) segment.status = 'upcoming';
  }
  const target = state.show.runOfShow.find((segment) => segment.id === segmentId);
  if (target && target.status === 'upcoming') target.status = 'ready';
}

export function skipSegment(state: BroadcastState, segmentId: string, nowMs: number): void {
  const target = state.show.runOfShow.find((segment) => segment.id === segmentId);
  if (!target) return;
  const wasLive = target.status === 'live';
  target.status = 'skipped';
  target.endedAtMs = nowMs;
  if (wasLive) {
    const next = nextPlayableSegment(state, segmentId);
    if (next) activateSegment(state, next.id, nowMs);
  }
}

export function nextPlayableSegment(
  state: BroadcastState,
  afterSegmentId: string | null,
): Segment | undefined {
  const index = state.show.runOfShow.findIndex((segment) => segment.id === afterSegmentId);
  return state.show.runOfShow.find(
    (segment, i) => i > index && (segment.status === 'upcoming' || segment.status === 'ready'),
  );
}

export function updateGuestMetadata(
  state: BroadcastState,
  guestId: string,
  patch: { name?: string; title?: string; organization?: string },
): Guest | undefined {
  const guest = state.speakers.guests.find((g) => g.id === guestId);
  if (!guest) return undefined;

  if (patch.name) guest.name = patch.name;
  if (patch.title) guest.title = patch.title;
  if (patch.organization) guest.organization = patch.organization;

  // Any graphic already carrying this person must reflect the correction.
  for (const slot of [state.graphics.current, state.graphics.prepared]) {
    if (slot?.guestId === guest.id) {
      slot.name = guest.name;
      slot.title = guest.title;
      slot.organization = guest.organization;
    }
  }

  return guest;
}

export function playMedia(state: BroadcastState, mediaId: string, nowMs: number): boolean {
  const item = state.media.library.find((m) => m.id === mediaId);
  if (!item) return false;
  state.media.activeMediaId = item.id;
  state.media.state = 'playing';
  state.media.positionSec = 0;

  const segment = state.show.runOfShow.find((s) => s.mediaId === item.id);
  if (segment && segment.status !== 'skipped' && segment.status !== 'completed') {
    activateSegment(state, segment.id, nowMs);
  }
  return true;
}

export function stopMedia(state: BroadcastState): void {
  state.media.state = 'stopped';
  state.media.positionSec = 0;
  state.media.activeMediaId = null;
}

export function moveSlide(state: BroadcastState, delta: number): number {
  const target = state.presentation.currentSlide + delta;
  state.presentation.currentSlide = Math.min(
    Math.max(1, target),
    Math.max(1, state.presentation.totalSlides),
  );
  return state.presentation.currentSlide;
}

/** Everything that changes when a guest takes the program feed. */
export function takeGuest(state: BroadcastState, guest: Guest, nowMs: number): string[] {
  const changes: string[] = [];
  const previousGuestId = state.speakers.activeGuestId;

  setProgramCamera(state, guest.cameraId);
  changes.push(`Camera ${guest.cameraId} to program`);

  state.speakers.activeGuestId = guest.id;
  if (state.speakers.preparedGuestId === guest.id) state.speakers.preparedGuestId = null;
  changes.push(`${guest.name} active`);

  setMicrophone(state, guest.microphoneId, 'live');
  changes.push(`Mic ${guest.microphoneId} live`);

  if (previousGuestId && previousGuestId !== guest.id) {
    const previous = state.speakers.guests.find((g) => g.id === previousGuestId);
    if (previous) {
      setMicrophone(state, previous.microphoneId, 'muted');
      changes.push(`Mic ${previous.microphoneId} muted`);
    }
  }

  showLowerThird(state, lowerThirdFor(guest));
  changes.push('Lower third up');

  const segment = state.show.runOfShow.find(
    (s) => s.guestId === guest.id && (s.status === 'upcoming' || s.status === 'ready'),
  );
  if (segment) {
    activateSegment(state, segment.id, nowMs);
    changes.push(`${segment.title} live`);
  }

  return changes;
}

/** Everything that changes when a guest is prepared but not yet taken. */
export function prepareGuest(state: BroadcastState, guest: Guest): string[] {
  const changes: string[] = [];

  setPreviewCamera(state, guest.cameraId);
  changes.push(`Camera ${guest.cameraId} to preview`);

  state.speakers.preparedGuestId = guest.id;
  changes.push(`${guest.name} prepared`);

  const mic = state.audio.microphones.find((m) => m.id === guest.microphoneId);
  if (mic && mic.state !== 'live') {
    setMicrophone(state, guest.microphoneId, 'ready');
    changes.push(`Mic ${guest.microphoneId} ready`);
  }

  state.graphics.prepared = lowerThirdFor(guest);
  changes.push('Lower third ready');

  const segment = state.show.runOfShow.find(
    (s) => s.guestId === guest.id && s.status === 'upcoming',
  );
  if (segment) {
    prepareSegment(state, segment.id);
    changes.push(`${segment.title} ready`);
  }

  return changes;
}
