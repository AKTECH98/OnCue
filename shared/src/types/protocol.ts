/**
 * WebSocket contract between the OnCue client and the OnCue server.
 *
 * The server is the only writer of broadcast state. Clients send intents and
 * receive authoritative snapshots.
 */

import type { BroadcastState, VoiceActivity } from './broadcast.js';

export type ToolSource = 'manual' | 'voice' | 'test';

export interface ToolInvocationResult {
  ok: boolean;
  tool: string;
  /** Short operator-facing sentence, e.g. "Camera three ready." */
  message: string;
  /** LangGraph node path taken to produce this result. */
  path: string[];
  durationMs: number;
  errorCode?: string;
  data?: Record<string, unknown>;
}

export interface TraceEntry {
  id: string;
  atMs: number;
  operation: string;
  args: Record<string, unknown>;
  source: ToolSource;
  path: string[];
  durationMs: number;
  ok: boolean;
  message: string;
  errorCode?: string;
}

export interface TranscriptEntry {
  id: string;
  atMs: number;
  role: 'operator' | 'oncue';
  text: string;
  partial: boolean;
}

export type ClientMessage =
  | { type: 'client:hello'; clientId?: string }
  | { type: 'state:request' }
  | { type: 'show:reset' }
  | {
      type: 'tool:invoke';
      requestId: string;
      tool: string;
      args: Record<string, unknown>;
      source: ToolSource;
    }
  /** A recognised operator utterance. Partials arrive with `final: false`. */
  | { type: 'voice:utterance'; text: string; final: boolean }
  /** The operator started talking over OnCue, or said "hold". */
  | { type: 'voice:interrupt'; reason: 'barge_in' | 'hold' }
  | { type: 'voice:listening'; listening: boolean };

export type ServerMessage =
  | { type: 'server:hello'; serverTimeMs: number; simulatedVoice: boolean; protocolVersion: number }
  | { type: 'state:snapshot'; state: BroadcastState }
  | { type: 'tool:result'; requestId: string | null; result: ToolInvocationResult }
  | { type: 'trace'; entry: TraceEntry }
  | { type: 'transcript'; entry: TranscriptEntry }
  | { type: 'voice:activity'; activity: VoiceActivity }
  /** What OnCue should say. Short by design — one clause, not a paragraph. */
  | { type: 'voice:say'; id: string; text: string }
  /** Stop speaking immediately; the operator has the floor. */
  | { type: 'voice:stop' }
  | { type: 'error'; code: string; message: string };

export const PROTOCOL_VERSION = 1;
