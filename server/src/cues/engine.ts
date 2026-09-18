import { randomUUID } from 'node:crypto';

import type { BroadcastState, Cue, CueTrigger } from '@oncue/shared';

import type { Orchestrator } from '../orchestration/orchestrator.js';
import type { BroadcastStore } from '../state/store.js';

export interface CueRequest {
  description: string;
  trigger: CueTrigger;
  actions: { tool: string; args: Record<string, unknown>; description: string }[];
  target: string | null;
}

const MAX_CUES = 12;

/**
 * The cue stack is the visible contract between what the operator said and
 * what OnCue intends to do.
 *
 * Immediate cues fire at once; triggered cues wait for the show to reach the
 * moment they were pinned to. A hold pauses all of it without losing anything.
 */
export class CueEngine {
  private evaluating = false;

  constructor(
    private readonly store: BroadcastStore,
    private readonly orchestrate: Orchestrator,
  ) {
    this.store.subscribe(() => this.evaluate());
  }

  /** Adds cues and fires any that are due right now. */
  async enqueue(requests: CueRequest[]): Promise<Cue[]> {
    const now = Date.now();
    const cues: Cue[] = requests.map((request) => ({
      id: randomUUID(),
      description: request.description,
      state: request.trigger.type === 'immediate' ? 'ready' : 'waiting',
      trigger: request.trigger,
      actions: request.actions,
      target: request.target,
      createdAtMs: now,
      updatedAtMs: now,
      note: null,
    }));

    this.store.update((draft) => {
      draft.cueEngine.cues = [...draft.cueEngine.cues, ...cues].slice(-MAX_CUES);
    });

    for (const cue of cues) {
      if (cue.state === 'ready') await this.fire(cue.id);
    }

    return cues;
  }

  /** Cancels everything not yet executed. Returns how many were dropped. */
  cancelPending(): number {
    let cancelled = 0;
    this.store.update((draft) => {
      for (const cue of draft.cueEngine.cues) {
        if (cue.state === 'ready' || cue.state === 'waiting') {
          cue.state = 'cancelled';
          cue.updatedAtMs = Date.now();
          cue.note = 'Cancelled by the operator';
          cancelled += 1;
        }
      }
    });
    return cancelled;
  }

  private async fire(cueId: string): Promise<void> {
    const cue = this.store.getState().cueEngine.cues.find((c) => c.id === cueId);
    if (!cue || (cue.state !== 'ready' && cue.state !== 'waiting')) return;

    this.setCueState(cueId, 'executing');

    const failures: string[] = [];
    for (const action of cue.actions) {
      const result = await this.orchestrate(action.tool, action.args, 'cue');
      if (!result.ok) failures.push(result.message);
    }

    this.setCueState(
      cueId,
      failures.length > 0 ? 'cancelled' : 'completed',
      failures[0] ?? null,
    );
  }

  /**
   * Fires anything whose moment has arrived. Runs on every state change, so it
   * must be cheap and must not recurse.
   */
  private evaluate(): void {
    if (this.evaluating) return;
    const state = this.store.getState();
    if (state.cueEngine.held) return;

    const due = state.cueEngine.cues.filter(
      (cue) => cue.state === 'waiting' && isTriggerMet(cue.trigger, state),
    );
    if (due.length === 0) return;

    this.evaluating = true;
    void (async () => {
      try {
        for (const cue of due) await this.fire(cue.id);
      } finally {
        this.evaluating = false;
      }
    })();
  }

  private setCueState(cueId: string, next: Cue['state'], note: string | null = null): void {
    this.store.update((draft) => {
      const cue = draft.cueEngine.cues.find((c) => c.id === cueId);
      if (!cue) return;
      cue.state = next;
      cue.updatedAtMs = Date.now();
      if (note) cue.note = note;
    });
  }
}

export function isTriggerMet(trigger: CueTrigger, state: BroadcastState): boolean {
  switch (trigger.type) {
    case 'immediate':
      return true;

    case 'after_active_speaker': {
      // Met once that speaker is no longer the one on air.
      if (!trigger.ref) return false;
      return state.speakers.activeGuestId !== trigger.ref;
    }

    case 'after_segment': {
      if (!trigger.ref) return false;
      const needle = trigger.ref.toLowerCase();
      const segment = state.show.runOfShow.find(
        (s) => s.id === needle || s.title.toLowerCase().includes(needle),
      );
      return segment ? segment.status === 'completed' || segment.status === 'skipped' : false;
    }

    case 'manual':
      return false;

    default:
      return false;
  }
}
