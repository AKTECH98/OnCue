/**
 * Core broadcast domain types.
 *
 * There is exactly one authoritative `BroadcastState`. It lives on the server
 * and is mirrored to every client. Nothing in the UI may keep a competing copy.
 */

export type CameraId = 1 | 2 | 3 | 4;
export type MicrophoneId = 1 | 2 | 3;

export const CAMERA_IDS: readonly CameraId[] = [1, 2, 3, 4];
export const MICROPHONE_IDS: readonly MicrophoneId[] = [1, 2, 3];

export type GuestRole = 'host' | 'guest';

export interface Guest {
  id: string;
  name: string;
  title: string;
  organization: string;
  role: GuestRole;
  cameraId: CameraId;
  microphoneId: MicrophoneId;
  /** Short spoken aliases the operator may use ("daniel", "kim", "vp product"). */
  aliases: string[];
  /** Tailwind-friendly hue used for the simulated camera feed. */
  tint: string;
  initials: string;
}

export type Tally = 'program' | 'preview' | 'off';

export interface Camera {
  id: CameraId;
  label: string;
  shot: string;
  guestId: string | null;
  tally: Tally;
}

export type MicrophoneState = 'live' | 'ready' | 'muted';

export interface Microphone {
  id: MicrophoneId;
  label: string;
  guestId: string | null;
  state: MicrophoneState;
  /** Simulated input level, 0..1. Animated client-side when live. */
  level: number;
}

export interface LowerThird {
  guestId: string;
  name: string;
  title: string;
  organization: string;
}

export type SegmentStatus = 'completed' | 'live' | 'ready' | 'upcoming' | 'skipped';

export interface Segment {
  id: string;
  title: string;
  /** Scheduled duration in seconds. */
  plannedDurationSec: number;
  status: SegmentStatus;
  guestId: string | null;
  mediaId: string | null;
  startedAtMs: number | null;
  endedAtMs: number | null;
}

export type CueState = 'ready' | 'waiting' | 'executing' | 'completed' | 'cancelled';

export type CueTriggerType = 'immediate' | 'after_active_speaker' | 'after_segment' | 'manual';

export interface CueTrigger {
  type: CueTriggerType;
  /** Human readable trigger, e.g. "Sarah finishes". */
  description: string;
  /** Segment or guest the trigger waits on, when applicable. */
  ref: string | null;
}

export interface CueAction {
  tool: string;
  args: Record<string, unknown>;
  description: string;
}

export interface Cue {
  id: string;
  description: string;
  state: CueState;
  trigger: CueTrigger;
  actions: CueAction[];
  target: string | null;
  createdAtMs: number;
  updatedAtMs: number;
  /** Populated when the cue fails or is cancelled. */
  note: string | null;
}

export type MediaState = 'idle' | 'playing' | 'paused' | 'stopped' | 'completed';

export interface MediaItem {
  id: string;
  title: string;
  durationSec: number;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'simulated' | 'error';

export type VoiceActivity = 'idle' | 'listening' | 'processing' | 'speaking' | 'interrupted';

export interface ToolResultSummary {
  tool: string;
  ok: boolean;
  message: string;
  atMs: number;
  durationMs: number;
  /** LangGraph node path taken for this execution. */
  path: string[];
}

export interface SystemError {
  code: string;
  message: string;
  atMs: number;
}

export interface ShowState {
  eventTitle: string;
  onAir: boolean;
  startedAtMs: number;
  elapsedSec: number;
  /** Where the show *should* be, given completed + live segment durations. */
  plannedElapsedSec: number;
  /** Positive = running late. */
  delaySec: number;
  currentSegmentId: string | null;
  nextSegmentId: string | null;
  runOfShow: Segment[];
}

export interface VideoState {
  programCamera: CameraId;
  previewCamera: CameraId | null;
  cameras: Camera[];
}

export interface SpeakerState {
  activeGuestId: string | null;
  preparedGuestId: string | null;
  guests: Guest[];
}

export interface AudioState {
  microphones: Microphone[];
  /** 0..100 */
  musicLevel: number;
}

export interface GraphicsState {
  current: LowerThird | null;
  prepared: LowerThird | null;
}

export interface PresentationState {
  currentSlide: number;
  totalSlides: number;
  slideTitles: string[];
}

export interface MediaPlaybackState {
  activeMediaId: string | null;
  state: MediaState;
  positionSec: number;
  library: MediaItem[];
}

export interface CueEngineState {
  cues: Cue[];
  /** True after "hold": nothing pending may fire until released. */
  held: boolean;
}

export interface SystemState {
  higgs: ConnectionState;
  voice: VoiceActivity;
  latestToolResult: ToolResultSummary | null;
  latestError: SystemError | null;
  /** True when the server is running without a Higgs API key. */
  simulatedVoice: boolean;
}

export interface BroadcastState {
  show: ShowState;
  video: VideoState;
  speakers: SpeakerState;
  audio: AudioState;
  graphics: GraphicsState;
  presentation: PresentationState;
  media: MediaPlaybackState;
  cueEngine: CueEngineState;
  system: SystemState;
  /** Monotonic counter; clients drop out-of-order snapshots. */
  revision: number;
}
