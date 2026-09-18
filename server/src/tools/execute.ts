import {
  CAMERA_IDS,
  MICROPHONE_IDS,
  type CameraId,
  type MicrophoneId,
  type MicrophoneState,
  type ToolInvocationResult,
  type ToolSource,
} from '@oncue/shared';

import {
  activateSegment,
  findGuest,
  findSegment,
  hideLowerThird,
  lowerThirdFor,
  nextPlayableSegment,
  prepareGuest,
  setMicrophone,
  setMusicLevel,
  setPreviewCamera,
  setProgramCamera,
  showLowerThird,
  skipSegment,
  takeGuest,
} from '../state/actions.js';
import type { BroadcastStore } from '../state/store.js';
import { tracer } from '../tracing/tracer.js';

/**
 * Phase 1 dispatcher: enough deterministic operations to drive the whole show
 * by hand. Phase 2 replaces the body of each case with schema-validated domain
 * tools; the call signature and wire protocol stay the same.
 */

interface Outcome {
  ok: boolean;
  message: string;
  errorCode?: string;
  data?: Record<string, unknown>;
}

const ok = (message: string, data?: Record<string, unknown>): Outcome => ({ ok: true, message, data });
const fail = (errorCode: string, message: string): Outcome => ({ ok: false, message, errorCode });

function asCameraId(value: unknown): CameraId | null {
  const n = Number(value);
  return (CAMERA_IDS as readonly number[]).includes(n) ? (n as CameraId) : null;
}

function asMicrophoneId(value: unknown): MicrophoneId | null {
  const n = Number(value);
  return (MICROPHONE_IDS as readonly number[]).includes(n) ? (n as MicrophoneId) : null;
}

export function createToolExecutor(store: BroadcastStore) {
  return async function executeTool(
    tool: string,
    args: Record<string, unknown>,
    source: ToolSource,
  ): Promise<ToolInvocationResult> {
    const startedAt = Date.now();
    const path = ['dispatch', tool];
    let outcome: Outcome;

    try {
      outcome = run(store, tool, args);
    } catch (error) {
      outcome = fail('tool_error', error instanceof Error ? error.message : 'Unexpected failure.');
    }

    const durationMs = Date.now() - startedAt;
    const result: ToolInvocationResult = {
      ok: outcome.ok,
      tool,
      message: outcome.message,
      path,
      durationMs,
      ...(outcome.errorCode ? { errorCode: outcome.errorCode } : {}),
      ...(outcome.data ? { data: outcome.data } : {}),
    };

    store.update((draft) => {
      draft.system.latestToolResult = {
        tool,
        ok: result.ok,
        message: result.message,
        atMs: startedAt,
        durationMs,
        path,
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
      path,
      durationMs,
      ok: result.ok,
      message: result.message,
      ...(result.errorCode ? { errorCode: result.errorCode } : {}),
    });

    return result;
  };
}

function run(store: BroadcastStore, tool: string, args: Record<string, unknown>): Outcome {
  const nowMs = Date.now();

  switch (tool) {
    case 'prepare_camera': {
      const cameraId = asCameraId(args.camera);
      if (cameraId === null) return fail('invalid_camera', 'There are four cameras.');
      store.update((draft) => setPreviewCamera(draft, cameraId));
      return ok(`Camera ${cameraId} ready.`);
    }

    case 'take_camera': {
      const cameraId = asCameraId(args.camera);
      if (cameraId === null) return fail('invalid_camera', 'There are four cameras.');
      if (store.getState().video.programCamera === cameraId) {
        return ok(`Camera ${cameraId} is already live.`);
      }
      store.update((draft) => setProgramCamera(draft, cameraId));
      return ok(`Camera ${cameraId} live.`);
    }

    case 'prepare_guest': {
      const guest = findGuest(store.getState(), String(args.guest ?? ''));
      if (!guest) return fail('unknown_guest', `I don't have a guest called that.`);
      let changes: string[] = [];
      store.update((draft) => {
        const target = findGuest(draft, guest.id)!;
        changes = prepareGuest(draft, target);
      });
      return ok(`${guest.name.split(' ')[0]} ready.`, { changes });
    }

    case 'take_guest': {
      const guest = findGuest(store.getState(), String(args.guest ?? ''));
      if (!guest) return fail('unknown_guest', `I don't have a guest called that.`);
      let changes: string[] = [];
      store.update((draft) => {
        const target = findGuest(draft, guest.id)!;
        changes = takeGuest(draft, target, nowMs);
      });
      return ok(`${guest.name.split(' ')[0]} live.`, { changes });
    }

    case 'set_microphone': {
      const microphoneId = asMicrophoneId(args.microphone);
      if (microphoneId === null) return fail('invalid_microphone', 'There are three microphones.');
      const micState = String(args.state ?? '') as MicrophoneState;
      if (!['live', 'ready', 'muted'].includes(micState)) {
        return fail('invalid_mic_state', 'Microphone state must be live, ready or muted.');
      }
      store.update((draft) => setMicrophone(draft, microphoneId, micState));
      return ok(`Mic ${microphoneId} ${micState}.`);
    }

    case 'set_music': {
      const level = Number(args.level);
      if (!Number.isFinite(level) || level < 0 || level > 100) {
        return fail('invalid_level', 'Music level runs from zero to one hundred.');
      }
      store.update((draft) => setMusicLevel(draft, level));
      return ok(level === 0 ? 'Music out.' : `Music at ${Math.round(level)}.`);
    }

    case 'show_lower_third': {
      const guest = findGuest(store.getState(), String(args.guest ?? ''));
      if (!guest) return fail('unknown_guest', `I don't have a guest called that.`);
      store.update((draft) => showLowerThird(draft, lowerThirdFor(guest)));
      return ok(`${guest.name.split(' ')[0]} lower third up.`);
    }

    case 'hide_lower_third': {
      if (!store.getState().graphics.current) return ok('No lower third is up.');
      store.update((draft) => hideLowerThird(draft));
      return ok('Lower third out.');
    }

    case 'advance_run_of_show': {
      const state = store.getState();
      const next = nextPlayableSegment(state, state.show.currentSegmentId);
      if (!next) return fail('end_of_show', 'That was the last segment.');
      store.update((draft) => activateSegment(draft, next.id, nowMs));
      return ok(`${next.title} live.`);
    }

    case 'skip_segment': {
      const state = store.getState();
      const reference = String(args.segment ?? '');
      const segment = reference
        ? findSegment(state, reference)
        : nextPlayableSegment(state, state.show.currentSegmentId);
      if (!segment) return fail('unknown_segment', `I don't have that segment.`);
      if (segment.status === 'skipped') return ok(`${segment.title} is already skipped.`);
      store.update((draft) => skipSegment(draft, segment.id, nowMs));
      return ok(`${segment.title} skipped.`);
    }

    case 'get_show_status': {
      const state = store.getState();
      const current = state.show.runOfShow.find((s) => s.id === state.show.currentSegmentId);
      const next = state.show.runOfShow.find((s) => s.id === state.show.nextSegmentId);
      return ok(
        `${current?.title ?? 'Nothing'} is live${next ? `, ${next.title} next` : ''}.`,
        {
          currentSegment: current?.title ?? null,
          nextSegment: next?.title ?? null,
          delaySec: state.show.delaySec,
          programCamera: state.video.programCamera,
        },
      );
    }

    default:
      return fail('tool_not_registered', `I can't do that yet.`);
  }
}
