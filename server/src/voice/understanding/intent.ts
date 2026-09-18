import type { VoiceContext } from '../backend.js';

import { parseMetadata, splitCorrection, verbFrom } from './corrections.js';
import { normalize, numberIn } from './normalize.js';

export interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
}

export interface Understanding {
  toolCalls: ToolCall[];
  /** Spoken reply that replaces the tool result, e.g. for a no-op confirmation. */
  say?: string;
  hold?: boolean;
}

/**
 * What the conversation has established so far.
 *
 * This is what makes "take him" meaningful. It is conversational memory only —
 * the production state remains the single source of truth for what is actually
 * on air.
 */
export interface ConversationMemory {
  lastGuestId: string | null;
  lastCameraId: number | null;
}

export const emptyMemory = (): ConversationMemory => ({ lastGuestId: null, lastCameraId: null });

const PREPARE_VERB = /\b(ready|prep|prepare|stand ?by|preview|set ?up|queue)\b/;
const TAKE_VERB = /\b(take|cut|punch|go to|switch to|bring up|on air)\b/;
const PERSON_PRONOUN = /\b(him|her|them|he|she|they)\b/;
const THING_PRONOUN = /\b(it|that|this|the same)\b/;
const STAY = /\b(stay|hold on|remain|keep)\b (on|with) /;

function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function resolveNamedGuest(text: string, context: VoiceContext): string | null {
  for (const guest of context.guests) {
    const names = [guest.id, guest.name.toLowerCase(), ...guest.aliases];
    if (names.some((name) => new RegExp(`\\b${escape(name)}\\b`).test(text))) return guest.id;
  }
  return null;
}

function cameraNumber(text: string): number | null {
  const explicit = text.match(/\b(?:camera|cam)\s*(\d{1,2}|\w+)\b/);
  if (explicit?.[1]) {
    const parsed = numberIn(explicit[1]);
    if (parsed !== null) return parsed;
  }
  return numberIn(text);
}

function guestName(guestId: string | null, context: VoiceContext): string {
  const guest = context.guests.find((g) => g.id === guestId);
  return guest ? (guest.name.split(' ')[0] ?? guest.name) : 'that';
}

/**
 * Resolves who "him" or "her" refers to.
 *
 * Preference order matches how a control room actually talks: whoever was just
 * named, then whoever is prepared, then whoever is on air.
 */
function resolvePerson(
  context: VoiceContext,
  memory: ConversationMemory,
): string | null {
  if (memory.lastGuestId) return memory.lastGuestId;

  const prepared = context.guests.find((g) => g.name === context.preparedSpeaker);
  if (prepared) return prepared.id;

  const active = context.guests.find((g) => g.name === context.activeSpeaker);
  return active?.id ?? null;
}

/** Resolves what "it" refers to: the camera just named, else what is in preview. */
function resolveThing(context: VoiceContext, memory: ConversationMemory): number | null {
  return memory.lastCameraId ?? context.previewCamera;
}

/**
 * Interprets one utterance, honouring any self-correction inside it.
 *
 * A corrected utterance is resolved from its tail; if the tail is only an
 * object ("three"), it inherits the verb the operator used before correcting.
 */
export function interpret(
  rawText: string,
  context: VoiceContext,
  memory: ConversationMemory,
): Understanding | null {
  const metadata = parseMetadata(rawText);
  if (metadata) {
    const guest =
      resolveNamedGuest(normalize(rawText), context) ??
      resolveNamedGuest(metadata.subject, context) ??
      memory.lastGuestId;
    if (!guest) return { toolCalls: [], say: 'Whose lower third?' };
    return {
      toolCalls: [
        { tool: 'update_lower_third', args: { guest, [metadata.field]: metadata.value } },
      ],
    };
  }

  const correction = splitCorrection(rawText);
  if (correction.corrected) {
    // "Take two — actually three": the tail carries the new target but not the
    // verb, so it inherits the one the operator used before correcting.
    const headVerb = verbFrom(correction.head);
    const effective =
      verbFrom(correction.tail) || !headVerb
        ? correction.tail
        : `${headVerb} ${correction.tail}`;

    const corrected = interpretDirect(effective, context, memory);
    if (corrected) return corrected;
  }

  return interpretDirect(rawText, context, memory);
}

function interpretDirect(
  rawText: string,
  context: VoiceContext,
  memory: ConversationMemory,
): Understanding | null {
  const text = normalize(rawText);
  if (!text) return null;

  if (/\b(cancel|drop|forget|never mind|scrub)\b/.test(text)) {
    return { toolCalls: [{ tool: 'cancel_pending', args: {} }] };
  }

  if (/\b(go ahead|resume|carry on|release|we.re back|back on|continue)\b/.test(text)) {
    return { toolCalls: [{ tool: 'release_hold', args: {} }] };
  }

  if (/\b(status|where are we|what.s (the )?status)\b/.test(text)) {
    return { toolCalls: [{ tool: 'get_show_status', args: {} }] };
  }

  if (/\bmusic\b/.test(text)) {
    if (/\b(out|off|kill|drop|fade|down|under)\b/.test(text)) {
      return { toolCalls: [{ tool: 'set_music', args: { level: 0 } }] };
    }
    const level = numberIn(text);
    if (level !== null) return { toolCalls: [{ tool: 'set_music', args: { level } }] };
    if (/\b(up|in|back)\b/.test(text)) {
      return { toolCalls: [{ tool: 'set_music', args: { level: 45 } }] };
    }
  }

  if (/\b(lower third|name ?key|super|graphic)\b/.test(text)) {
    if (/\b(out|off|clear|hide|lose|kill|drop)\b/.test(text)) {
      return { toolCalls: [{ tool: 'hide_lower_third', args: {} }] };
    }
    const guest = resolveNamedGuest(text, context) ?? memory.lastGuestId;
    if (guest) return { toolCalls: [{ tool: 'show_lower_third', args: { guest } }] };
  }

  const wantsPrepare = PREPARE_VERB.test(text);
  const wantsTake = TAKE_VERB.test(text);
  const namedGuest = resolveNamedGuest(text, context);

  // "Stay on her" is an instruction to do nothing, and must be honoured as one.
  if (STAY.test(text)) {
    const target = namedGuest ?? (PERSON_PRONOUN.test(text) ? resolvePerson(context, memory) : null);
    if (target || THING_PRONOUN.test(text)) {
      const who = target ? guestName(target, context) : `camera ${context.programCamera}`;
      return { toolCalls: [], say: `Staying on ${who}.` };
    }
  }

  if (namedGuest) {
    if (wantsTake && !wantsPrepare) {
      return { toolCalls: [{ tool: 'take_guest', args: { guest: namedGuest } }] };
    }
    return { toolCalls: [{ tool: 'prepare_guest', args: { guest: namedGuest } }] };
  }

  // Pronouns only resolve to a person when no camera number was spoken.
  const camera = cameraNumber(text);

  if (camera === null && PERSON_PRONOUN.test(text)) {
    const target = resolvePerson(context, memory);
    if (!target) return { toolCalls: [], say: 'Who do you mean?' };
    if (wantsTake) return { toolCalls: [{ tool: 'take_guest', args: { guest: target } }] };
    if (wantsPrepare) return { toolCalls: [{ tool: 'prepare_guest', args: { guest: target } }] };
  }

  if (camera === null && THING_PRONOUN.test(text)) {
    const target = resolveThing(context, memory);
    if (target === null) return { toolCalls: [], say: 'Nothing is ready.' };
    if (wantsTake) return { toolCalls: [{ tool: 'take_camera', args: { camera: target } }] };
    if (wantsPrepare) return { toolCalls: [{ tool: 'prepare_camera', args: { camera: target } }] };
  }

  if (camera !== null) {
    if (wantsTake && !wantsPrepare) return { toolCalls: [{ tool: 'take_camera', args: { camera } }] };
    if (wantsPrepare) return { toolCalls: [{ tool: 'prepare_camera', args: { camera } }] };
  }

  return null;
}

/** Records what this turn established, so the next one can say "him" or "it". */
export function rememberFrom(
  calls: ToolCall[],
  memory: ConversationMemory,
): ConversationMemory {
  const next = { ...memory };
  for (const call of calls) {
    if (typeof call.args.guest === 'string') next.lastGuestId = call.args.guest;
    if (typeof call.args.camera === 'number') next.lastCameraId = call.args.camera;
  }
  return next;
}

/** Cue-stack wording: what the operator would write on a run sheet. */
export function describeCall(call: ToolCall, context: VoiceContext): string {
  const who = () => guestName(String(call.args.guest ?? ''), context);
  const camera = () => `camera ${call.args.camera}`;

  switch (call.tool) {
    case 'prepare_guest':
      return `Ready ${who()}`;
    case 'take_guest':
      return `Take ${who()}`;
    case 'prepare_camera':
      return `Ready ${camera()}`;
    case 'take_camera':
      return `Take ${camera()}`;
    case 'set_music':
      return Number(call.args.level) === 0 ? 'Fade music' : `Music to ${call.args.level}`;
    case 'show_lower_third':
      return `Show ${who()} lower third`;
    case 'hide_lower_third':
      return 'Clear lower third';
    case 'skip_segment':
      return call.args.segment ? `Skip ${String(call.args.segment)}` : 'Skip next segment';
    case 'advance_run_of_show':
      return 'Next segment';
    case 'set_microphone':
      return `Mic ${call.args.microphone} ${call.args.state}`;
    default:
      return call.tool.replace(/_/g, ' ');
  }
}

export function describeCalls(calls: ToolCall[], context: VoiceContext): string {
  return calls.map((call) => describeCall(call, context)).join(', ');
}

/** Conversational replies for utterances that are not operational requests. */
export function smallTalk(rawText: string, context: VoiceContext): string | null {
  const text = normalize(rawText);

  if (/\b(hello|hey|hi|you there|are you there|oncue)\b/.test(text) && text.split(' ').length <= 4) {
    return 'OnCue here.';
  }
  if (/\b(thanks|thank you|nice|good work|perfect)\b/.test(text)) return 'Copy.';
  if (/\bwhat.?s (on|live|up)\b/.test(text)) {
    return `${context.activeSpeaker ?? `Camera ${context.programCamera}`} on program.`;
  }
  return null;
}
