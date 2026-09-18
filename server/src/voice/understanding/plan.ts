import type { CueTrigger } from '@oncue/shared';

import type { VoiceContext } from '../backend.js';

import { normalize } from './normalize.js';
import { resolveNamedGuest, type ConversationMemory, type ToolCall } from './intent.js';

export interface PlannedStep {
  /** What the operator asked for, phrased for the cue stack. */
  description: string;
  trigger: CueTrigger;
  calls: ToolCall[];
}

const IMMEDIATE: CueTrigger = { type: 'immediate', description: 'Now', ref: null };

/**
 * Splits a multi-part instruction into clauses.
 *
 * "Daniel next, music out after Sarah, then take three" is three clauses, and
 * the trigger introduced by the second one carries forward to the third —
 * which is what "then" means to an operator.
 */
export function splitClauses(rawText: string): string[] {
  // Split before normalizing: commas are clause boundaries, and normalize
  // strips them as punctuation noise. A comma followed by a correction
  // ("take two, actually three") is not a boundary — it is one instruction.
  return rawText
    .split(
      /\s*(?:,|;|\band then\b|\bthen\b|\bafter that\b)(?!\s*(?:actually|no\b|make that|i mean|scratch that|sorry|rather|instead))\s*/i,
    )
    .map((clause) => normalize(clause))
    .filter((clause) => clause.length > 0);
}

const AFTER_CLAUSE = /\bafter\s+(?<ref>[\w' ]+?)(?:\s+(?:finishes|is done|wraps|ends))?$/;

/** Extracts an "after X" trigger and returns the clause without it. */
export function extractTrigger(
  clause: string,
  context: VoiceContext,
): { trigger: CueTrigger | null; remainder: string } {
  const match = AFTER_CLAUSE.exec(clause);
  if (!match?.groups?.ref) return { trigger: null, remainder: clause };

  const ref = match.groups.ref.trim();
  const remainder = clause.slice(0, match.index).trim();
  const guestId = resolveNamedGuest(ref, context);

  if (guestId) {
    const guest = context.guests.find((g) => g.id === guestId);
    const firstName = guest?.name.split(' ')[0] ?? ref;
    return {
      trigger: {
        type: 'after_active_speaker',
        description: `${firstName} finishes`,
        ref: guestId,
      },
      remainder,
    };
  }

  return {
    trigger: { type: 'after_segment', description: `${ref} finishes`, ref },
    remainder,
  };
}

export interface PlanOptions {
  context: VoiceContext;
  memory: ConversationMemory;
  /** Interprets a single clause; supplied by the backend to avoid a cycle. */
  interpretClause: (
    clause: string,
    context: VoiceContext,
    memory: ConversationMemory,
  ) => { toolCalls: ToolCall[]; say?: string } | null;
  rememberFrom: (calls: ToolCall[], memory: ConversationMemory) => ConversationMemory;
  describe: (calls: ToolCall[], clause: string, context: VoiceContext) => string;
}

export interface Plan {
  steps: PlannedStep[];
  /** A clause-level reply, e.g. when one clause was purely conversational. */
  say: string | null;
  memory: ConversationMemory;
}

export function planUtterance(rawText: string, options: PlanOptions): Plan {
  const { context, interpretClause, rememberFrom, describe } = options;
  const clauses = splitClauses(rawText);

  let memory = options.memory;
  let carriedTrigger: CueTrigger | null = null;
  let say: string | null = null;
  const steps: PlannedStep[] = [];

  for (const clause of clauses) {
    const { trigger, remainder } = extractTrigger(clause, context);
    if (trigger) carriedTrigger = trigger;

    const body = remainder || clause;
    const understanding = interpretClause(body, context, memory);
    if (!understanding) continue;

    if (understanding.toolCalls.length === 0) {
      say ??= understanding.say ?? null;
      continue;
    }

    memory = rememberFrom(understanding.toolCalls, memory);
    steps.push({
      description: describe(understanding.toolCalls, body, context),
      trigger: carriedTrigger ?? IMMEDIATE,
      calls: understanding.toolCalls,
    });
  }

  return { steps, say, memory };
}

export const immediateTrigger = (): CueTrigger => ({ ...IMMEDIATE });
