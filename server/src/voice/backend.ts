import type { VoiceActivity } from '@oncue/shared';

import type { PlannedStep } from './understanding/plan.js';

/**
 * What OnCue decided to do with a turn of speech.
 *
 * A backend is responsible for understanding; it never touches broadcast
 * state. Tool requests are handed back and executed through LangGraph.
 */
export interface VoiceTurn {
  /** What OnCue should say back. Keep it to a few words. */
  say: string | null;
  /** Tools to run right now, in order. */
  toolCalls: { tool: string; args: Record<string, unknown> }[];
  /**
   * A multi-part instruction becomes a plan instead: each step carries the
   * moment it should fire, and the whole thing lands on the cue stack.
   */
  steps?: PlannedStep[];
  /** True when the operator asked everything to stop. */
  hold: boolean;
}

export interface VoiceContext {
  /** Only the production facts that change what an utterance means. */
  currentSegment: string | null;
  nextSegment: string | null;
  activeSpeaker: string | null;
  preparedSpeaker: string | null;
  programCamera: number;
  previewCamera: number | null;
  delaySec: number;
  guests: { id: string; name: string; aliases: string[]; cameraId: number }[];
}

export interface VoiceBackend {
  readonly name: 'higgs' | 'simulated';
  /** Ready to take speech. */
  readonly ready: boolean;
  /** Interpret one final operator utterance. */
  handleUtterance(text: string, context: VoiceContext): Promise<VoiceTurn>;
  /** Result of a tool the backend asked for, so it can phrase the reply. */
  observeToolResult?(tool: string, ok: boolean, message: string): void;
  close?(): Promise<void>;
}

export type ActivityListener = (activity: VoiceActivity) => void;
