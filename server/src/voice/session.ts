import { randomUUID } from 'node:crypto';

import type { ServerMessage, VoiceActivity } from '@oncue/shared';

import { env } from '../config/env.js';
import type { Orchestrator } from '../orchestration/orchestrator.js';
import type { BroadcastStore } from '../state/store.js';

import type { VoiceBackend, VoiceContext } from './backend.js';
import { SimulatedVoiceBackend } from './simulated.js';

export interface VoiceSessionOptions {
  store: BroadcastStore;
  orchestrate: Orchestrator;
  send: (message: ServerMessage) => void;
}

/**
 * One voice session per connected console.
 *
 * Responsibilities: turn bookkeeping, interruption, transcript events and
 * activity state. Understanding belongs to the backend; execution belongs to
 * LangGraph. This class is the seam between them.
 */
export class VoiceSession {
  private readonly backend: VoiceBackend;
  private activity: VoiceActivity = 'idle';
  /** Rising counter so a stale turn cannot speak after an interruption. */
  private turnId = 0;

  constructor(private readonly options: VoiceSessionOptions) {
    this.backend = createVoiceBackend();
  }

  get backendName(): string {
    return this.backend.name;
  }

  setListening(listening: boolean): void {
    this.setActivity(listening ? 'listening' : 'idle');
  }

  /**
   * Interruption is the core realtime behaviour: OnCue must yield the floor
   * immediately and the session must stay alive.
   */
  interrupt(reason: 'barge_in' | 'hold'): void {
    this.turnId += 1;
    this.options.send({ type: 'voice:stop' });
    this.setActivity(reason === 'hold' ? 'interrupted' : 'listening');

    if (reason === 'hold') {
      this.options.store.update((draft) => {
        draft.cueEngine.held = true;
      });
      this.say('Holding.');
    }
  }

  /** Release a hold so audience-visible actions can run again. */
  release(): void {
    this.options.store.update((draft) => {
      draft.cueEngine.held = false;
    });
  }

  transcribe(text: string, final: boolean): void {
    this.options.send({
      type: 'transcript',
      entry: {
        id: randomUUID(),
        atMs: Date.now(),
        role: 'operator',
        text,
        partial: !final,
      },
    });
  }

  async handleUtterance(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return;

    this.turnId += 1;
    const turnId = this.turnId;

    this.transcribe(trimmed, true);
    this.setActivity('processing');

    const turn = await this.backend.handleUtterance(trimmed, this.context());

    // A newer turn started while we were thinking: drop this one silently.
    if (turnId !== this.turnId) return;

    if (turn.hold) {
      this.options.store.update((draft) => {
        draft.cueEngine.held = true;
      });
    } else if (turn.toolCalls.length > 0) {
      this.release();
    }

    for (const call of turn.toolCalls) {
      const result = await this.options.orchestrate(call.tool, call.args, 'voice');
      this.backend.observeToolResult?.(call.tool, result.ok, result.message);
      if (turnId !== this.turnId) return;
    }

    if (turn.say) this.say(turn.say);
    else this.setActivity('listening');
  }

  say(text: string): void {
    const id = randomUUID();
    this.options.send({ type: 'voice:say', id, text });
    this.options.send({
      type: 'transcript',
      entry: { id, atMs: Date.now(), role: 'oncue', text, partial: false },
    });
    this.setActivity('speaking');
  }

  finishedSpeaking(): void {
    if (this.activity === 'speaking') this.setActivity('listening');
  }

  async close(): Promise<void> {
    await this.backend.close?.();
  }

  private context(): VoiceContext {
    const state = this.options.store.getState();
    const segment = (id: string | null) =>
      state.show.runOfShow.find((s) => s.id === id)?.title ?? null;
    const guestName = (id: string | null) =>
      state.speakers.guests.find((g) => g.id === id)?.name ?? null;

    return {
      currentSegment: segment(state.show.currentSegmentId),
      nextSegment: segment(state.show.nextSegmentId),
      activeSpeaker: guestName(state.speakers.activeGuestId),
      preparedSpeaker: guestName(state.speakers.preparedGuestId),
      programCamera: state.video.programCamera,
      previewCamera: state.video.previewCamera,
      delaySec: state.show.delaySec,
      guests: state.speakers.guests.map((g) => ({
        id: g.id,
        name: g.name,
        aliases: g.aliases,
        cameraId: g.cameraId,
      })),
    };
  }

  private setActivity(activity: VoiceActivity): void {
    if (this.activity === activity) return;
    this.activity = activity;
    this.options.send({ type: 'voice:activity', activity });
    this.options.store.update((draft) => {
      draft.system.voice = activity;
      draft.system.higgs = env.higgsEnabled ? 'connected' : 'simulated';
    });
  }
}

function createVoiceBackend(): VoiceBackend {
  // Higgs is wired in Phase 5 once credentials and the endpoint are known.
  return new SimulatedVoiceBackend();
}
