import type { VoiceContext, VoiceTurn } from '../backend.js';

import { normalize, numberIn } from './normalize.js';

export interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
}

/**
 * Production shorthand, not natural language in general.
 *
 * "Ready" prepares, "take" commits — that distinction is the whole grammar.
 * Everything here is deterministic so the demo behaves the same every run;
 * the Higgs backend replaces this module wholesale, not the layers around it.
 */

const PREPARE_VERB = /\b(ready|prep|prepare|stand ?by|preview|set ?up|queue)\b/;
const TAKE_VERB = /\b(take|cut|punch|go to|switch to|on air|live)\b/;

export function resolveGuest(text: string, context: VoiceContext): string | null {
  for (const guest of context.guests) {
    const names = [guest.id, guest.name.toLowerCase(), ...guest.aliases];
    if (names.some((name) => new RegExp(`\\b${escape(name)}\\b`).test(text))) return guest.id;
  }
  return null;
}

function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cameraNumber(text: string): number | null {
  const explicit = text.match(/\b(?:camera|cam)\s*(\d{1,2}|\w+)\b/);
  if (explicit?.[1]) {
    const parsed = numberIn(explicit[1]);
    if (parsed !== null) return parsed;
  }
  return numberIn(text);
}

/**
 * Turns one operator utterance into the operations it implies.
 * Returns null when nothing actionable was said.
 */
export function parseIntent(rawText: string, context: VoiceContext): ToolCall[] | null {
  const text = normalize(rawText);
  if (!text) return null;

  const guestId = resolveGuest(text, context);
  const wantsPrepare = PREPARE_VERB.test(text);
  const wantsTake = TAKE_VERB.test(text);

  if (/\b(status|where are we|what.s (the )?status)\b/.test(text)) {
    return [{ tool: 'get_show_status', args: {} }];
  }

  if (guestId) {
    // "Daniel next" and "Daniel's up" are prepares even without a verb.
    if (wantsTake && !wantsPrepare) return [{ tool: 'take_guest', args: { guest: guestId } }];
    if (wantsPrepare || /\b(next|up next|after|on deck|standing by)\b/.test(text)) {
      return [{ tool: 'prepare_guest', args: { guest: guestId } }];
    }
    return [{ tool: 'prepare_guest', args: { guest: guestId } }];
  }

  const camera = cameraNumber(text);
  if (camera !== null) {
    if (wantsTake && !wantsPrepare) return [{ tool: 'take_camera', args: { camera } }];
    if (wantsPrepare) return [{ tool: 'prepare_camera', args: { camera } }];
  }

  return null;
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

export function emptyTurn(): VoiceTurn {
  return { say: null, toolCalls: [], hold: false };
}
