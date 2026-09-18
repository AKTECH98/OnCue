/**
 * The single predefined broadcast used for the whole demo:
 * FutureTech Live 2026.
 *
 * `createInitialState()` returns a deep, independent copy every time, so the
 * Reset Show control can restore a known-good rehearsal state instantly.
 */

import type {
  BroadcastState,
  Camera,
  Guest,
  MediaItem,
  Microphone,
  Segment,
} from './types/broadcast.js';

export const EVENT_TITLE = 'FutureTech Live 2026';

export const GUESTS: readonly Guest[] = [
  {
    id: 'maya',
    name: 'Maya Patel',
    title: 'Host',
    organization: 'FutureTech Live',
    role: 'host',
    cameraId: 2,
    microphoneId: 2,
    aliases: ['maya', 'patel', 'host', 'maya patel'],
    tint: '#f59e0b',
    initials: 'MP',
  },
  {
    id: 'sarah',
    name: 'Sarah Chen',
    title: 'CEO',
    organization: 'Nova Labs',
    role: 'guest',
    cameraId: 1,
    microphoneId: 1,
    aliases: ['sarah', 'chen', 'sarah chen', 'ceo'],
    tint: '#38bdf8',
    initials: 'SC',
  },
  {
    id: 'daniel',
    name: 'Daniel Kim',
    title: 'VP Product',
    organization: 'Nova Labs',
    role: 'guest',
    cameraId: 3,
    microphoneId: 3,
    aliases: ['daniel', 'kim', 'daniel kim', 'vp product'],
    tint: '#a78bfa',
    initials: 'DK',
  },
];

export const MEDIA_LIBRARY: readonly MediaItem[] = [
  { id: 'product-video', title: 'Nova Labs Product Film', durationSec: 150 },
  { id: 'break-bumper', title: 'Break Bumper', durationSec: 20 },
];

export const SLIDE_TITLES: readonly string[] = [
  'FutureTech Live 2026',
  'Nova Labs — Company Snapshot',
  'Platform Architecture',
  'Roadmap 2026',
  'Thank You',
];

interface SegmentSeed {
  id: string;
  title: string;
  plannedDurationSec: number;
  guestId: string | null;
  mediaId: string | null;
}

const SEGMENT_SEEDS: readonly SegmentSeed[] = [
  { id: 'opening', title: 'Opening', plannedDurationSec: 60, guestId: null, mediaId: null },
  { id: 'maya-intro', title: 'Maya Introduction', plannedDurationSec: 120, guestId: 'maya', mediaId: null },
  { id: 'sarah-interview', title: 'Sarah Interview', plannedDurationSec: 300, guestId: 'sarah', mediaId: null },
  { id: 'product-video', title: 'Product Video', plannedDurationSec: 150, guestId: null, mediaId: 'product-video' },
  { id: 'daniel-interview', title: 'Daniel Interview', plannedDurationSec: 300, guestId: 'daniel', mediaId: null },
  { id: 'qa', title: 'Q&A', plannedDurationSec: 240, guestId: 'maya', mediaId: null },
  { id: 'closing', title: 'Closing', plannedDurationSec: 60, guestId: 'maya', mediaId: null },
];

const CAMERA_SEEDS: readonly Omit<Camera, 'tally'>[] = [
  { id: 1, label: 'CAM 1', shot: 'Sarah — close', guestId: 'sarah' },
  { id: 2, label: 'CAM 2', shot: 'Maya — host', guestId: 'maya' },
  { id: 3, label: 'CAM 3', shot: 'Daniel — close', guestId: 'daniel' },
  { id: 4, label: 'CAM 4', shot: 'Wide stage', guestId: null },
];

/**
 * The show opens mid-flight: Sarah is live and the production is deliberately
 * ~2 minutes behind so the run-of-show recommendation demo has something real
 * to reason about.
 */
const OPENING_DELAY_SEC = 125;
const SARAH_ON_AIR_SEC = 150;

export function createInitialState(nowMs: number = Date.now()): BroadcastState {
  const liveIndex = SEGMENT_SEEDS.findIndex((s) => s.id === 'sarah-interview');

  const runOfShow: Segment[] = SEGMENT_SEEDS.map((seed, index) => {
    const status: Segment['status'] =
      index < liveIndex ? 'completed' : index === liveIndex ? 'live' : 'upcoming';
    return {
      id: seed.id,
      title: seed.title,
      plannedDurationSec: seed.plannedDurationSec,
      status,
      guestId: seed.guestId,
      mediaId: seed.mediaId,
      startedAtMs: index <= liveIndex ? nowMs - SARAH_ON_AIR_SEC * 1000 : null,
      endedAtMs: index < liveIndex ? nowMs - SARAH_ON_AIR_SEC * 1000 : null,
    };
  });

  const completedPlannedSec = SEGMENT_SEEDS.slice(0, liveIndex).reduce(
    (total, seed) => total + seed.plannedDurationSec,
    0,
  );
  const elapsedSec = completedPlannedSec + SARAH_ON_AIR_SEC + OPENING_DELAY_SEC;

  const cameras: Camera[] = CAMERA_SEEDS.map((seed) => ({
    ...seed,
    tally: seed.id === 1 ? 'program' : seed.id === 4 ? 'preview' : 'off',
  }));

  const microphones: Microphone[] = [
    { id: 1, label: 'MIC 1', guestId: 'sarah', state: 'live', level: 0.62 },
    { id: 2, label: 'MIC 2', guestId: 'maya', state: 'ready', level: 0.08 },
    { id: 3, label: 'MIC 3', guestId: 'daniel', state: 'muted', level: 0 },
  ];

  const sarah = GUESTS.find((g) => g.id === 'sarah')!;

  return {
    show: {
      eventTitle: EVENT_TITLE,
      onAir: true,
      startedAtMs: nowMs - elapsedSec * 1000,
      elapsedSec,
      plannedElapsedSec: completedPlannedSec + SARAH_ON_AIR_SEC,
      delaySec: OPENING_DELAY_SEC,
      currentSegmentId: 'sarah-interview',
      nextSegmentId: 'product-video',
      runOfShow,
    },
    video: {
      programCamera: 1,
      previewCamera: 4,
      cameras,
    },
    speakers: {
      activeGuestId: 'sarah',
      preparedGuestId: null,
      guests: GUESTS.map((guest) => ({ ...guest, aliases: [...guest.aliases] })),
    },
    audio: {
      microphones,
      musicLevel: 12,
    },
    graphics: {
      current: {
        guestId: sarah.id,
        name: sarah.name,
        title: sarah.title,
        organization: sarah.organization,
      },
      prepared: null,
    },
    presentation: {
      currentSlide: 1,
      totalSlides: SLIDE_TITLES.length,
      slideTitles: [...SLIDE_TITLES],
    },
    media: {
      activeMediaId: null,
      state: 'idle',
      positionSec: 0,
      library: MEDIA_LIBRARY.map((item) => ({ ...item })),
    },
    cueEngine: {
      cues: [],
      held: false,
    },
    system: {
      higgs: 'disconnected',
      voice: 'idle',
      latestToolResult: null,
      latestError: null,
      simulatedVoice: true,
    },
    revision: 1,
  };
}
