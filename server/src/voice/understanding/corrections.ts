import { normalize } from './normalize.js';

/**
 * People correct themselves mid-sentence, and in a live show the correction is
 * the instruction. "Take two — actually three" must never put camera two on
 * program, not even for a frame.
 */
/**
 * Consecutive markers ("— actually") are one correction, not two, so the
 * separator consumes a whole run of them.
 */
const CORRECTION_MARKER =
  /\s(?:(?:--|actually|no wait|no,? make that|make that|i mean|scratch that|sorry|rather|instead)\s*)+/g;

export interface Correction {
  /** Everything before the final correction marker. */
  head: string;
  /** What the operator actually meant. */
  tail: string;
  corrected: boolean;
}

export function splitCorrection(rawText: string): Correction {
  const text = normalize(rawText);
  const parts = text.split(CORRECTION_MARKER).filter((part) => part.trim().length > 0);

  if (parts.length < 2) return { head: text, tail: text, corrected: false };

  return {
    head: parts.slice(0, -1).join(' ').trim(),
    tail: parts[parts.length - 1]!.trim(),
    corrected: true,
  };
}

/** The verb the operator used before correcting themselves. */
export function verbFrom(text: string): 'take' | 'ready' | null {
  if (/\b(take|cut|punch|go to|switch to|bring up|on air)\b/.test(text)) return 'take';
  if (/\b(ready|prep|prepare|stand ?by|preview|set ?up|queue)\b/.test(text)) return 'ready';
  return null;
}

export interface MetadataCorrection {
  field: 'title' | 'name' | 'organization';
  value: string;
  /** Text with the metadata clause removed, for guest resolution. */
  subject: string;
}

const FIELD_PATTERN =
  /\b(?<subject>[\w' ]*?)\b(?<field>title|name|company|organization|org|role)\s+(?:is|should be|reads|says)\s+(?<value>.+)$/;

const FIELD_MAP: Record<string, MetadataCorrection['field']> = {
  title: 'title',
  role: 'title',
  name: 'name',
  company: 'organization',
  organization: 'organization',
  org: 'organization',
};

/**
 * Recognises "Daniel's title is CTO" and, when the operator corrects
 * themselves, keeps only the corrected value.
 */
export function parseMetadata(rawText: string): MetadataCorrection | null {
  const { head, tail, corrected } = splitCorrection(rawText);
  const source = corrected ? head : tail;

  const match = FIELD_PATTERN.exec(source);
  if (!match?.groups) return null;

  const field = FIELD_MAP[match.groups.field ?? ''];
  if (!field) return null;

  const value = (corrected ? tail : (match.groups.value ?? '')).trim();
  if (!value) return null;

  return {
    field,
    value: titleCase(value),
    subject: match.groups.subject?.trim() ?? '',
  };
}

/** Speech recognition gives lowercase; lower thirds are displayed as typed. */
function titleCase(value: string): string {
  const acronyms = new Set(['ceo', 'cto', 'coo', 'cfo', 'vp', 'svp', 'evp', 'ai', 'ml']);
  return value
    .split(' ')
    .map((word) =>
      acronyms.has(word) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(' ');
}
