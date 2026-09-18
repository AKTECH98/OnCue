import { randomUUID } from 'node:crypto';

import type { TraceEntry } from '@oncue/shared';

import { env } from '../config/env.js';

export type TracingMode = 'langsmith' | 'local';

export interface TracingHealth {
  mode: TracingMode;
  ok: boolean;
  detail: string;
  project: string;
}

const MAX_BUFFERED_TRACES = 200;

/**
 * Traces meaningful operations only — never raw audio chunks.
 *
 * LangSmith is optional. Without credentials every trace still lands in the
 * in-memory buffer that powers the diagnostics panel and `GET /api/traces`,
 * so the demo is never blocked on an API key.
 */
class Tracer {
  private readonly buffer: TraceEntry[] = [];
  private readonly listeners = new Set<(entry: TraceEntry) => void>();
  private client: import('langsmith').Client | null = null;
  private clientPromise: Promise<import('langsmith').Client | null> | null = null;

  get mode(): TracingMode {
    return env.langsmithEnabled ? 'langsmith' : 'local';
  }

  subscribe(listener: (entry: TraceEntry) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  list(limit = 50): TraceEntry[] {
    return this.buffer.slice(-limit).reverse();
  }

  record(entry: Omit<TraceEntry, 'id'> & { id?: string }): TraceEntry {
    const full: TraceEntry = { id: entry.id ?? randomUUID(), ...entry };
    this.buffer.push(full);
    if (this.buffer.length > MAX_BUFFERED_TRACES) this.buffer.shift();
    for (const listener of this.listeners) listener(full);
    void this.forward(full);
    return full;
  }

  async health(): Promise<TracingHealth> {
    if (!env.langsmithEnabled) {
      return {
        mode: 'local',
        ok: true,
        detail: 'LangSmith disabled — traces buffered locally at GET /api/traces',
        project: env.LANGSMITH_PROJECT,
      };
    }
    try {
      const client = await this.getClient();
      if (!client) throw new Error('LangSmith client unavailable');
      await client.createRun({
        name: 'oncue.tracing.selftest',
        run_type: 'chain',
        inputs: { check: 'startup' },
        outputs: { ok: true },
        project_name: env.LANGSMITH_PROJECT,
        start_time: Date.now(),
        end_time: Date.now(),
      });
      return {
        mode: 'langsmith',
        ok: true,
        detail: `Connected to LangSmith project "${env.LANGSMITH_PROJECT}"`,
        project: env.LANGSMITH_PROJECT,
      };
    } catch (error) {
      return {
        mode: 'langsmith',
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
        project: env.LANGSMITH_PROJECT,
      };
    }
  }

  private async getClient(): Promise<import('langsmith').Client | null> {
    if (this.client) return this.client;
    this.clientPromise ??= (async () => {
      const { Client } = await import('langsmith');
      this.client = new Client({
        apiKey: env.LANGSMITH_API_KEY,
        apiUrl: env.LANGSMITH_ENDPOINT,
      });
      return this.client;
    })();
    return this.clientPromise;
  }

  private async forward(entry: TraceEntry): Promise<void> {
    if (!env.langsmithEnabled) return;
    try {
      const client = await this.getClient();
      await client?.createRun({
        id: entry.id,
        name: `oncue.${entry.operation}`,
        run_type: 'chain',
        inputs: { args: entry.args, source: entry.source },
        outputs: { ok: entry.ok, message: entry.message, path: entry.path },
        error: entry.ok ? undefined : (entry.errorCode ?? entry.message),
        project_name: env.LANGSMITH_PROJECT,
        start_time: entry.atMs,
        end_time: entry.atMs + entry.durationMs,
        extra: { metadata: { path: entry.path.join(' > '), durationMs: entry.durationMs } },
      });
    } catch {
      // Tracing must never break a live show.
    }
  }
}

export const tracer = new Tracer();
