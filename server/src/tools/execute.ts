import type { ToolInvocationResult, ToolSource } from '@oncue/shared';

import type { BroadcastStore } from '../state/store.js';
import { tracer } from '../tracing/tracer.js';

import { getTool, type ToolOutcome } from './registry.js';

/**
 * Validates arguments against the tool's schema, then runs it.
 *
 * Invalid input never reaches the domain layer, so a rejected call is
 * guaranteed to leave the production state untouched. Orchestration lives in
 * the LangGraph layer above this; this function stays deterministic and sync.
 */
export function runTool(
  store: BroadcastStore,
  tool: string,
  args: Record<string, unknown>,
): { outcome: ToolOutcome } {
  const definition = getTool(tool);
  if (!definition) {
    return {
      outcome: { ok: false, message: "I can't do that.", errorCode: 'tool_not_registered' },
    };
  }

  const parsed = definition.schema.safeParse(args ?? {});
  if (!parsed.success) {
    return {
      outcome: {
        ok: false,
        message: parsed.error.issues[0]?.message ?? 'That request is not valid.',
        errorCode: 'invalid_arguments',
      },
    };
  }

  try {
    return { outcome: definition.run({ store, nowMs: Date.now() }, parsed.data as never) };
  } catch (error) {
    return {
      outcome: {
        ok: false,
        message: 'That did not work.',
        errorCode: 'tool_error',
        data: { detail: error instanceof Error ? error.message : String(error) },
      },
    };
  }
}

export interface FinalizeInput {
  store: BroadcastStore;
  tool: string;
  args: Record<string, unknown>;
  source: ToolSource;
  outcome: ToolOutcome;
  path: string[];
  startedAtMs: number;
  durationMs: number;
}

/**
 * Turns a tool outcome into the wire result, records it on the state as the
 * latest tool result, and emits one trace. Audio never reaches this function.
 */
export function finalizeResult({
  store,
  tool,
  args,
  source,
  outcome,
  path,
  startedAtMs,
  durationMs,
}: FinalizeInput): ToolInvocationResult {
  const data =
    outcome.data || outcome.changes
      ? {
          ...(outcome.data ?? {}),
          ...(outcome.changes ? { changes: outcome.changes } : {}),
        }
      : undefined;

  const result: ToolInvocationResult = {
    ok: outcome.ok,
    tool,
    message: outcome.message,
    path,
    durationMs,
    ...(outcome.errorCode ? { errorCode: outcome.errorCode } : {}),
    ...(data ? { data } : {}),
  };

  store.update((draft) => {
    draft.system.latestToolResult = {
      tool,
      ok: result.ok,
      message: result.message,
      atMs: startedAtMs,
      durationMs,
      path,
    };
    draft.system.latestError = result.ok
      ? null
      : { code: result.errorCode ?? 'tool_error', message: result.message, atMs: startedAtMs };
  });

  tracer.record({
    atMs: startedAtMs,
    operation: tool,
    args,
    source,
    path,
    durationMs,
    ok: result.ok,
    message: result.message,
    ...(result.errorCode ? { errorCode: result.errorCode } : {}),
  });

  return result;
}
