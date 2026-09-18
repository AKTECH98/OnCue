import {
  toolSchemas,
  type BroadcastState,
  type ToolArgs,
  type ToolName,
} from '@oncue/shared';

import {
  activateSegment,
  findGuest,
  findSegment,
  hideLowerThird,
  lowerThirdFor,
  moveSlide,
  nextPlayableSegment,
  playMedia,
  prepareGuest,
  prepareSegment,
  setMicrophone,
  setMusicLevel,
  setPreviewCamera,
  setProgramCamera,
  showLowerThird,
  skipSegment,
  stopMedia,
  takeGuest,
  updateGuestMetadata,
} from '../state/actions.js';
import type { BroadcastStore } from '../state/store.js';

/**
 * Risk drives orchestration routing in Phase 3.
 * - low:    nothing the audience can see changes
 * - normal: the audience sees it immediately
 * - high:   destructive; requires explicit confirmation
 */
export type RiskLevel = 'low' | 'normal' | 'high';

export interface ToolOutcome {
  ok: boolean;
  /** Short spoken-style sentence. Keep it terse: "Three ready." */
  message: string;
  errorCode?: string;
  /** Individual state changes, used for traces and the cue stack. */
  changes?: string[];
  data?: Record<string, unknown>;
  /** The request was valid but reality already matched it. */
  redundant?: boolean;
}

export interface ToolContext {
  store: BroadcastStore;
  nowMs: number;
}

export interface ToolDefinition<N extends ToolName = ToolName> {
  name: N;
  /** Written for Higgs: what this does and when to reach for it. */
  description: string;
  risk: RiskLevel;
  schema: (typeof toolSchemas)[N];
  run: (ctx: ToolContext, args: ToolArgs<N>) => ToolOutcome;
}

const ok = (message: string, extra: Omit<ToolOutcome, 'ok' | 'message'> = {}): ToolOutcome => ({
  ok: true,
  message,
  ...extra,
});

const fail = (errorCode: string, message: string): ToolOutcome => ({
  ok: false,
  message,
  errorCode,
});

const firstName = (name: string): string => name.split(' ')[0] ?? name;

const UNKNOWN_GUEST = "I don't have a speaker by that name.";
const UNKNOWN_SEGMENT = "That segment isn't in the run of show.";

function define<N extends ToolName>(definition: ToolDefinition<N>): ToolDefinition<N> {
  return definition;
}

/** Resolves a spoken guest reference against the live state, or explains why not. */
function resolveGuest(state: BroadcastState, reference: string) {
  return findGuest(state, reference);
}

const definitions = [
  define({
    name: 'prepare_camera',
    description: 'Put a camera into preview without changing what the audience sees.',
    risk: 'low',
    schema: toolSchemas.prepare_camera,
    run: ({ store }, { camera }) => {
      if (store.getState().video.programCamera === camera) {
        return ok(`Camera ${camera} is already live.`, { redundant: true });
      }
      if (store.getState().video.previewCamera === camera) {
        return ok(`Camera ${camera} is already ready.`, { redundant: true });
      }
      store.update((draft) => setPreviewCamera(draft, camera));
      return ok(`Camera ${camera} ready.`, { changes: [`Camera ${camera} to preview`] });
    },
  }),

  define({
    name: 'take_camera',
    description: 'Cut a camera to program. The audience sees this immediately.',
    risk: 'normal',
    schema: toolSchemas.take_camera,
    run: ({ store }, { camera }) => {
      if (store.getState().video.programCamera === camera) {
        return ok(`Camera ${camera} is already live.`, { redundant: true });
      }
      store.update((draft) => setProgramCamera(draft, camera));
      return ok(`Camera ${camera} live.`, { changes: [`Camera ${camera} to program`] });
    },
  }),

  define({
    name: 'prepare_guest',
    description:
      'Get a speaker ready off air: their camera to preview, mic ready, lower third and segment queued.',
    risk: 'low',
    schema: toolSchemas.prepare_guest,
    run: ({ store }, { guest }) => {
      const target = resolveGuest(store.getState(), guest);
      if (!target) return fail('unknown_guest', UNKNOWN_GUEST);
      if (store.getState().speakers.activeGuestId === target.id) {
        return ok(`${firstName(target.name)} is already live.`, { redundant: true });
      }
      if (store.getState().speakers.preparedGuestId === target.id) {
        return ok(`${firstName(target.name)} is already ready.`, { redundant: true });
      }

      let changes: string[] = [];
      store.update((draft) => {
        changes = prepareGuest(draft, findGuest(draft, target.id)!);
      });
      return ok(`${firstName(target.name)} ready.`, { changes, data: { guestId: target.id } });
    },
  }),

  define({
    name: 'take_guest',
    description:
      'Put a speaker on air. Coordinates camera, microphones, lower third and the run of show in one move.',
    risk: 'normal',
    schema: toolSchemas.take_guest,
    run: ({ store, nowMs }, { guest }) => {
      const target = resolveGuest(store.getState(), guest);
      if (!target) return fail('unknown_guest', UNKNOWN_GUEST);
      if (store.getState().speakers.activeGuestId === target.id) {
        return ok(`${firstName(target.name)} is already live.`, { redundant: true });
      }

      let changes: string[] = [];
      store.update((draft) => {
        changes = takeGuest(draft, findGuest(draft, target.id)!, nowMs);
      });
      return ok(`${firstName(target.name)} live.`, { changes, data: { guestId: target.id } });
    },
  }),

  define({
    name: 'set_microphone',
    description: 'Set one microphone to live, ready or muted.',
    risk: 'normal',
    schema: toolSchemas.set_microphone,
    run: ({ store }, { microphone, state }) => {
      const current = store.getState().audio.microphones.find((m) => m.id === microphone);
      if (current?.state === state) {
        return ok(`Mic ${microphone} is already ${state}.`, { redundant: true });
      }
      store.update((draft) => setMicrophone(draft, microphone, state));
      return ok(`Mic ${microphone} ${state}.`, { changes: [`Mic ${microphone} ${state}`] });
    },
  }),

  define({
    name: 'set_music',
    description: 'Set the music bed level from 0 to 100. Use 0 to take music out.',
    risk: 'normal',
    schema: toolSchemas.set_music,
    run: ({ store }, { level }) => {
      const rounded = Math.round(level);
      if (store.getState().audio.musicLevel === rounded) {
        return ok(rounded === 0 ? 'Music is already out.' : `Music is already at ${rounded}.`, {
          redundant: true,
        });
      }
      store.update((draft) => setMusicLevel(draft, rounded));
      return ok(rounded === 0 ? 'Music out.' : `Music at ${rounded}.`, {
        changes: [rounded === 0 ? 'Music out' : `Music to ${rounded}`],
      });
    },
  }),

  define({
    name: 'show_lower_third',
    description: "Put a speaker's lower third on screen.",
    risk: 'normal',
    schema: toolSchemas.show_lower_third,
    run: ({ store }, { guest }) => {
      const target = resolveGuest(store.getState(), guest);
      if (!target) return fail('unknown_guest', UNKNOWN_GUEST);
      if (store.getState().graphics.current?.guestId === target.id) {
        return ok(`${firstName(target.name)}'s lower third is already up.`, { redundant: true });
      }
      store.update((draft) => showLowerThird(draft, lowerThirdFor(findGuest(draft, target.id)!)));
      return ok(`${firstName(target.name)} lower third up.`, { changes: ['Lower third up'] });
    },
  }),

  define({
    name: 'hide_lower_third',
    description: 'Clear the lower third currently on screen.',
    risk: 'normal',
    schema: toolSchemas.hide_lower_third,
    run: ({ store }) => {
      if (!store.getState().graphics.current) {
        return ok('No lower third is up.', { redundant: true });
      }
      store.update((draft) => hideLowerThird(draft));
      return ok('Lower third out.', { changes: ['Lower third out'] });
    },
  }),

  define({
    name: 'update_lower_third',
    description:
      "Correct a speaker's name, title or organization. Updates the graphic on screen if it is theirs.",
    risk: 'normal',
    schema: toolSchemas.update_lower_third,
    run: ({ store }, { guest, name, title, organization }) => {
      const target = resolveGuest(store.getState(), guest);
      if (!target) return fail('unknown_guest', UNKNOWN_GUEST);

      let updated: { name: string; title: string } | null = null;
      store.update((draft) => {
        const next = updateGuestMetadata(draft, target.id, { name, title, organization });
        if (next) updated = { name: next.name, title: next.title };
      });
      if (!updated) return fail('unknown_guest', UNKNOWN_GUEST);

      const { name: finalName, title: finalTitle } = updated as { name: string; title: string };
      return ok(`${firstName(finalName)} is ${finalTitle}.`, {
        changes: [`Lower third: ${finalName}, ${finalTitle}`],
      });
    },
  }),

  define({
    name: 'next_slide',
    description: 'Advance the presentation by one slide.',
    risk: 'low',
    schema: toolSchemas.next_slide,
    run: ({ store }) => {
      const before = store.getState().presentation.currentSlide;
      let after = before;
      store.update((draft) => {
        after = moveSlide(draft, 1);
      });
      if (after === before) return ok('That is the last slide.', { redundant: true });
      return ok(`Slide ${after}.`, { changes: [`Slide ${after}`] });
    },
  }),

  define({
    name: 'previous_slide',
    description: 'Go back one slide in the presentation.',
    risk: 'low',
    schema: toolSchemas.previous_slide,
    run: ({ store }) => {
      const before = store.getState().presentation.currentSlide;
      let after = before;
      store.update((draft) => {
        after = moveSlide(draft, -1);
      });
      if (after === before) return ok('That is the first slide.', { redundant: true });
      return ok(`Slide ${after}.`, { changes: [`Slide ${after}`] });
    },
  }),

  define({
    name: 'play_video',
    description: 'Roll a prerecorded item. Defaults to the product video.',
    risk: 'normal',
    schema: toolSchemas.play_video,
    run: ({ store, nowMs }, { media }) => {
      const state = store.getState();
      const mediaId = media ?? state.media.library[0]?.id;
      if (!mediaId) return fail('unknown_media', "I don't have that clip.");

      const item = state.media.library.find((m) => m.id === mediaId || m.title.toLowerCase().includes(mediaId.toLowerCase()));
      if (!item) return fail('unknown_media', "I don't have that clip.");
      if (state.media.activeMediaId === item.id && state.media.state === 'playing') {
        return ok(`${item.title} is already rolling.`, { redundant: true });
      }

      store.update((draft) => playMedia(draft, item.id, nowMs));
      return ok(`Rolling ${item.title}.`, { changes: [`${item.title} rolling`] });
    },
  }),

  define({
    name: 'stop_video',
    description: 'Stop whatever prerecorded item is rolling.',
    risk: 'normal',
    schema: toolSchemas.stop_video,
    run: ({ store }) => {
      if (store.getState().media.state !== 'playing') {
        return ok('Nothing is rolling.', { redundant: true });
      }
      store.update((draft) => stopMedia(draft));
      return ok('Video stopped.', { changes: ['Video stopped'] });
    },
  }),

  define({
    name: 'prepare_segment',
    description: 'Queue a run-of-show segment as the next one up.',
    risk: 'low',
    schema: toolSchemas.prepare_segment,
    run: ({ store }, { segment }) => {
      const target = findSegment(store.getState(), segment);
      if (!target) return fail('unknown_segment', UNKNOWN_SEGMENT);
      if (target.status === 'live') return ok(`${target.title} is already live.`, { redundant: true });
      if (target.status === 'ready') return ok(`${target.title} is already ready.`, { redundant: true });
      if (target.status === 'completed' || target.status === 'skipped') {
        return fail('segment_finished', `${target.title} is already behind us.`);
      }
      store.update((draft) => prepareSegment(draft, target.id));
      return ok(`${target.title} ready.`, { changes: [`${target.title} ready`] });
    },
  }),

  define({
    name: 'skip_segment',
    description:
      'Drop a segment from the show. With no argument, skips the next one up. Buys back its scheduled time.',
    risk: 'normal',
    schema: toolSchemas.skip_segment,
    run: ({ store, nowMs }, { segment }) => {
      const state = store.getState();
      const target = segment
        ? findSegment(state, segment)
        : nextPlayableSegment(state, state.show.currentSegmentId);
      if (!target) return fail('unknown_segment', UNKNOWN_SEGMENT);
      if (target.status === 'skipped') {
        return ok(`${target.title} is already skipped.`, { redundant: true });
      }
      if (target.status === 'completed') {
        return fail('segment_finished', `${target.title} already played.`);
      }
      store.update((draft) => skipSegment(draft, target.id, nowMs));
      return ok(`${target.title} skipped.`, {
        changes: [`${target.title} skipped`],
        data: { savedSec: target.plannedDurationSec },
      });
    },
  }),

  define({
    name: 'advance_run_of_show',
    description: 'Move to the next segment in the run of show.',
    risk: 'normal',
    schema: toolSchemas.advance_run_of_show,
    run: ({ store, nowMs }) => {
      const state = store.getState();
      const next = nextPlayableSegment(state, state.show.currentSegmentId);
      if (!next) return fail('end_of_show', 'That was the last segment.');
      store.update((draft) => activateSegment(draft, next.id, nowMs));
      return ok(`${next.title} live.`, { changes: [`${next.title} live`] });
    },
  }),

  define({
    name: 'get_show_status',
    description:
      'Read back where the show is: current segment, what is next, how late we are, and what is on program.',
    risk: 'low',
    schema: toolSchemas.get_show_status,
    run: ({ store }) => {
      const state = store.getState();
      const current = state.show.runOfShow.find((s) => s.id === state.show.currentSegmentId);
      const next = state.show.runOfShow.find((s) => s.id === state.show.nextSegmentId);
      const activeGuest = state.speakers.guests.find((g) => g.id === state.speakers.activeGuestId);

      const delayMinutes = Math.round(Math.abs(state.show.delaySec) / 60);
      const schedule =
        Math.abs(state.show.delaySec) < 30
          ? 'on schedule'
          : state.show.delaySec > 0
            ? `about ${delayMinutes || 1} minute${delayMinutes === 1 ? '' : 's'} behind`
            : `about ${delayMinutes || 1} minute${delayMinutes === 1 ? '' : 's'} ahead`;

      return ok(
        `${current?.title ?? 'Nothing'} is live${next ? `, ${next.title} next` : ''}. We're ${schedule}.`,
        {
          data: {
            currentSegment: current?.title ?? null,
            nextSegment: next?.title ?? null,
            delaySec: state.show.delaySec,
            programCamera: state.video.programCamera,
            previewCamera: state.video.previewCamera,
            activeSpeaker: activeGuest?.name ?? null,
          },
        },
      );
    },
  }),

  define({
    name: 'reset_show',
    description: 'Restore the entire production to the known rehearsal starting state.',
    risk: 'high',
    schema: toolSchemas.reset_show,
    run: ({ store }) => {
      store.reset();
      return ok('Show reset.', { changes: ['Show reset to rehearsal state'] });
    },
  }),
];

export const toolRegistry = new Map<ToolName, ToolDefinition>(
  definitions.map((definition) => [definition.name, definition as ToolDefinition]),
);

export function getTool(name: string): ToolDefinition | undefined {
  return toolRegistry.get(name as ToolName);
}

export const allTools = (): ToolDefinition[] => [...toolRegistry.values()];
