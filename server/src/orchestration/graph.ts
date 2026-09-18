import type { ToolSource } from '@oncue/shared';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';

import type { BroadcastStore } from '../state/store.js';
import { runTool } from '../tools/execute.js';
import { getTool, type RiskLevel, type ToolOutcome } from '../tools/registry.js';

/**
 * The orchestration graph sits between "what Higgs asked for" and "what the
 * production actually does":
 *
 *   validate_input → read_state → check_safety → resolve_operation
 *                                      ↓               ↓
 *                              request_confirmation  execute → return_result
 *
 * It never sees audio. It only ever processes a resolved operational request.
 */

export interface StateReading {
  programCamera: number;
  previewCamera: number | null;
  activeGuestId: string | null;
  preparedGuestId: string | null;
  currentSegment: string | null;
  delaySec: number;
  held: boolean;
}

const OrchestrationState = Annotation.Root({
  tool: Annotation<string>,
  args: Annotation<Record<string, unknown>>,
  source: Annotation<ToolSource>,
  /** Set when the operator has already approved a high-risk action. */
  confirmed: Annotation<boolean>,

  path: Annotation<string[]>({
    reducer: (previous, next) => [...previous, ...next],
    default: () => [],
  }),
  risk: Annotation<RiskLevel>,
  reading: Annotation<StateReading | null>,
  /** Human-readable note about how the request was resolved. */
  resolution: Annotation<string | null>,
  outcome: Annotation<ToolOutcome | null>,
});

export type OrchestrationStateType = typeof OrchestrationState.State;

function readState(store: BroadcastStore): StateReading {
  const state = store.getState();
  return {
    programCamera: state.video.programCamera,
    previewCamera: state.video.previewCamera,
    activeGuestId: state.speakers.activeGuestId,
    preparedGuestId: state.speakers.preparedGuestId,
    currentSegment: state.show.currentSegmentId,
    delaySec: state.show.delaySec,
    held: state.cueEngine.held,
  };
}

export function buildOrchestrationGraph(store: BroadcastStore) {
  const graph = new StateGraph(OrchestrationState)
    .addNode('validate_input', (state) => {
      const definition = getTool(state.tool);
      if (!definition) {
        return {
          path: ['validate_input'],
          outcome: {
            ok: false,
            message: "I can't do that.",
            errorCode: 'tool_not_registered',
          } satisfies ToolOutcome,
        };
      }

      const parsed = definition.schema.safeParse(state.args ?? {});
      if (!parsed.success) {
        return {
          path: ['validate_input'],
          risk: definition.risk,
          outcome: {
            ok: false,
            message: parsed.error.issues[0]?.message ?? 'That request is not valid.',
            errorCode: 'invalid_arguments',
          } satisfies ToolOutcome,
        };
      }

      return { path: ['validate_input'], risk: definition.risk };
    })

    .addNode('read_state', () => ({
      path: ['read_state'],
      reading: readState(store),
    }))

    .addNode('check_safety', (state) => {
      // A hold freezes anything the audience would notice; preview work is fine.
      if (state.reading?.held && state.risk !== 'low') {
        return {
          path: ['check_safety'],
          outcome: {
            ok: false,
            message: 'Holding.',
            errorCode: 'on_hold',
          } satisfies ToolOutcome,
        };
      }
      return { path: ['check_safety'] };
    })

    .addNode('request_confirmation', (state) => ({
      path: ['request_confirmation'],
      outcome: {
        ok: false,
        message:
          state.tool === 'reset_show'
            ? 'That resets the whole show. Confirm?'
            : 'That one needs a confirmation.',
        errorCode: 'confirmation_required',
      } satisfies ToolOutcome,
    }))

    .addNode('resolve_operation', (state) => {
      const compound = state.tool === 'take_guest' || state.tool === 'prepare_guest';
      return {
        path: ['resolve_operation'],
        resolution: compound ? 'compound guest orchestration' : 'direct operation',
      };
    })

    .addNode('execute', (state) => {
      const { outcome } = runTool(store, state.tool, state.args);
      return { path: ['execute'], outcome };
    })

    .addNode('return_result', (state) => ({
      path: [state.outcome?.redundant ? 'return_result:redundant' : 'return_result'],
    }))

    .addEdge(START, 'validate_input')
    .addConditionalEdges(
      'validate_input',
      (state) => (state.outcome ? 'reject' : 'continue'),
      { reject: 'return_result', continue: 'read_state' },
    )
    .addEdge('read_state', 'check_safety')
    .addConditionalEdges(
      'check_safety',
      (state) => {
        if (state.outcome) return 'reject';
        // High-risk operations spoken aloud need an explicit go-ahead.
        if (state.risk === 'high' && state.source === 'voice' && !state.confirmed) return 'confirm';
        return 'continue';
      },
      { reject: 'return_result', confirm: 'request_confirmation', continue: 'resolve_operation' },
    )
    .addEdge('request_confirmation', 'return_result')
    .addEdge('resolve_operation', 'execute')
    .addEdge('execute', 'return_result')
    .addEdge('return_result', END);

  return graph.compile();
}

export type OrchestrationGraph = ReturnType<typeof buildOrchestrationGraph>;
