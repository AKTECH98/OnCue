import { createInitialState, type BroadcastState } from '@oncue/shared';

import { deriveState } from './derive.js';

type Listener = (state: BroadcastState) => void;

/**
 * The single source of truth for the production.
 *
 * Mutations happen through `update`, which hands the caller a draft copy,
 * re-derives computed fields, bumps the revision and notifies subscribers.
 * Readers always receive a frozen-by-convention snapshot they must not edit.
 */
export class BroadcastStore {
  private state: BroadcastState;
  private readonly listeners = new Set<Listener>();
  private clock: NodeJS.Timeout | null = null;

  constructor(nowMs: number = Date.now()) {
    this.state = deriveState(createInitialState(nowMs), nowMs);
  }

  getState(): BroadcastState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  update(mutate: (draft: BroadcastState) => void, options: { silent?: boolean } = {}): BroadcastState {
    const draft = structuredClone(this.state);
    mutate(draft);
    draft.revision = this.state.revision + 1;
    this.state = deriveState(draft, Date.now());
    if (!options.silent) this.emit();
    return this.state;
  }

  /** Restores the known rehearsal state. Essential for repeated demo runs. */
  reset(): BroadcastState {
    const nowMs = Date.now();
    const previousRevision = this.state.revision;
    const fresh = deriveState(createInitialState(nowMs), nowMs);
    fresh.revision = previousRevision + 1;
    fresh.system = { ...this.state.system, latestToolResult: null, latestError: null };
    this.state = fresh;
    this.emit();
    return this.state;
  }

  /** Advances the show clock so elapsed time and delay stay honest. */
  startClock(intervalMs = 1000): void {
    if (this.clock) return;
    this.clock = setInterval(() => {
      this.update(() => {}, { silent: false });
    }, intervalMs);
    this.clock.unref?.();
  }

  stopClock(): void {
    if (!this.clock) return;
    clearInterval(this.clock);
    this.clock = null;
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.state);
  }
}
