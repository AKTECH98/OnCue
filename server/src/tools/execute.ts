import type { ToolInvocationResult, ToolSource } from '@oncue/shared';

import type { BroadcastStore } from '../state/store.js';
import { tracer } from '../tracing/tracer.js';

import { getTool, type ToolOutcome } from './registry.js';

export interface ExecuteOptions {
  /** Node path recorded on the result; Phase 3 supplies the LangGraph path. */
  path?: string[];
  /** Skip trace + state bookkeeping, for unit tests. */
  quiet?: boolean;
}

/**
 * Validates arguments against the tool's schema, then runs it.
 *
 * Invalid input never reaches the domain layer, so a rejected call is
 * guaranteed to leave the production state untouched.
 */
export function runTool(
  store: BroadcastStore,
  tool: string,
  args: Record<string, unknown>,
): { outcome: ToolOutcome; path: string[] } {
  const definition = getTool(tool);
  if (!definition) {
    return {
      outcome: { ok: false, message: "I can't do that.", errorCode: 'tool_not_registered' },
      path: ['reject:unknown_tool'],
    };
  }

  const parsed = definition.schema.safeParse(args ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      outcome: {
        ok: false,
        message: issue?.message ?? 'That request is not valid.',
        errorCode: 'invalid_arguments',
      },
      path: ['validate', 'reject:invalid_arguments'],
    };
  }

  try {
    const outcome = definition.run(
      { store, nowMs: Date.now() },
      parsed.data as never,
    );
    return {
      outcome,
      path: [
        'validate',
        outcome.ok ? (outcome.redundant ? 'resolve:redundant' : 'execute') : 'reject:domain',
      ],
    };
  } catch (error) {
    return {
      outcome: {
        ok: false,
        message: 'That did not work.',
        errorCode: 'tool_error',
        data: { detail: error instanceof Error ? error.message : String(error) },
      },
      path: ['validate', 'error'],
    };
  }
}

export function createToolExecutor(store: BroadcastStore) {
  return async function executeTool(
    tool: string,
    args: Record<string, unknown>,
    source: ToolSource,
    options: ExecuteOptions = {},
  ): Promise<ToolInvocationResult> {
    const startedAt = Date.now();
    const { outcome, path } = runTool(store, tool, args);
    const durationMs = Date.now() - startedAt;
    const fullPath = options.path ?? path;

    const result: ToolInvocationResult = {
      ok: outcome.ok,
      tool,
      message: outcome.message,
      path: fullPath,
      durationMs,
      ...(outcome.errorCode ? { errorCode: outcome.errorCode } : {}),
      ...(outcome.data || outcome.changes
        ? { data: { ...(outcome.data ?? {}), ...(outcome.changes ? { changes: outcome.changes } : {}) } }
        : {}),
    };

    if (options.quiet) return result;

    store.update((draft) => {
      draft.system.latestToolResult = {
        tool,
        ok: result.ok,
        message: result.message,
        atMs: startedAt,
        durationMs,
        path: fullPath,
      };
      draft.system.latestError = result.ok
        ? null
        : { code: result.errorCode ?? 'tool_error', message: result.message, atMs: startedAt };
    });

    tracer.record({
      atMs: startedAt,
      operation: tool,
      args,
      source,
      path: fullPath,
      durationMs,
      ok: result.ok,
      message: result.message,
      ...(result.errorCode ? { errorCode: result.errorCode } : {}),
    });

    return result;
  };
}

export type ToolExecutor = ReturnType<typeof createToolExecutor>;
