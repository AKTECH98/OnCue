import type { ToolInvocationResult, ToolSource } from '@oncue/shared';

import type { BroadcastStore } from '../state/store.js';
import { finalizeResult } from '../tools/execute.js';
import type { ToolOutcome } from '../tools/registry.js';

import { buildOrchestrationGraph } from './graph.js';

export interface OrchestrateOptions {
  /** The operator has already approved a high-risk action. */
  confirmed?: boolean;
}

export type Orchestrator = (
  tool: string,
  args: Record<string, unknown>,
  source: ToolSource,
  options?: OrchestrateOptions,
) => Promise<ToolInvocationResult>;

const GRAPH_FAILURE: ToolOutcome = {
  ok: false,
  message: 'That did not go through.',
  errorCode: 'orchestration_failed',
};

/**
 * Every operational request — voice, manual button, or test harness — goes
 * through the same graph, so the state they produce is identical by
 * construction.
 */
export function createOrchestrator(store: BroadcastStore): Orchestrator {
  const graph = buildOrchestrationGraph(store);

  return async function orchestrate(tool, args, source, options = {}) {
    const startedAtMs = Date.now();
    let outcome: ToolOutcome = GRAPH_FAILURE;
    let path: string[] = ['orchestrate'];

    try {
      const final = await graph.invoke({
        tool,
        args: args ?? {},
        source,
        confirmed: options.confirmed ?? false,
      });
      outcome = final.outcome ?? GRAPH_FAILURE;
      path = final.path ?? path;
    } catch (error) {
      outcome = {
        ...GRAPH_FAILURE,
        data: { detail: error instanceof Error ? error.message : String(error) },
      };
      path = [...path, 'error'];
    }

    return finalizeResult({
      store,
      tool,
      args: args ?? {},
      source,
      outcome,
      path,
      startedAtMs,
      durationMs: Date.now() - startedAtMs,
    });
  };
}
