import { z } from 'zod';

import { CAMERA_IDS, MICROPHONE_IDS, type CameraId, type MicrophoneId } from '../types/broadcast.js';

/**
 * Argument schemas for every broadcast domain tool.
 *
 * Error messages are written the way OnCue should say them out loud, because
 * a rejected tool call becomes spoken feedback to the operator.
 */

const cameraIds = CAMERA_IDS as readonly number[];
const microphoneIds = MICROPHONE_IDS as readonly number[];

export const cameraArg = z.coerce
  .number({ invalid_type_error: 'I need a camera number.' })
  .int('I need a camera number.')
  .refine((value) => cameraIds.includes(value), { message: 'There are four cameras.' })
  .transform((value) => value as CameraId);

export const microphoneArg = z.coerce
  .number({ invalid_type_error: 'I need a microphone number.' })
  .int('I need a microphone number.')
  .refine((value) => microphoneIds.includes(value), { message: 'There are three microphones.' })
  .transform((value) => value as MicrophoneId);

export const guestArg = z
  .string({ required_error: 'Which speaker?', invalid_type_error: 'Which speaker?' })
  .trim()
  .min(1, 'Which speaker?');

export const segmentArg = z
  .string({ invalid_type_error: 'Which segment?' })
  .trim()
  .min(1, 'Which segment?');

export const microphoneStateArg = z.enum(['live', 'ready', 'muted'], {
  errorMap: () => ({ message: 'A microphone can be live, ready or muted.' }),
});

export const musicLevelArg = z.coerce
  .number({ invalid_type_error: 'Music level runs from zero to one hundred.' })
  .min(0, 'Music level runs from zero to one hundred.')
  .max(100, 'Music level runs from zero to one hundred.');

export const toolSchemas = {
  prepare_camera: z.object({ camera: cameraArg }),
  take_camera: z.object({ camera: cameraArg }),

  prepare_guest: z.object({ guest: guestArg }),
  take_guest: z.object({ guest: guestArg }),

  set_microphone: z.object({ microphone: microphoneArg, state: microphoneStateArg }),
  set_music: z.object({ level: musicLevelArg }),

  show_lower_third: z.object({ guest: guestArg }),
  hide_lower_third: z.object({}),
  update_lower_third: z
    .object({
      guest: guestArg,
      name: z.string().trim().min(1).optional(),
      title: z.string().trim().min(1).optional(),
      organization: z.string().trim().min(1).optional(),
    })
    .refine((value) => Boolean(value.name ?? value.title ?? value.organization), {
      message: 'Tell me what to change on the lower third.',
    }),

  next_slide: z.object({}),
  previous_slide: z.object({}),

  play_video: z.object({ media: z.string().trim().min(1).optional() }),
  stop_video: z.object({}),

  prepare_segment: z.object({ segment: segmentArg }),
  skip_segment: z.object({ segment: segmentArg.optional() }),
  advance_run_of_show: z.object({}),

  get_show_status: z.object({}),
  reset_show: z.object({}),
} as const;

export type ToolName = keyof typeof toolSchemas;

export const TOOL_NAMES = Object.keys(toolSchemas) as ToolName[];

export function isToolName(value: string): value is ToolName {
  return Object.prototype.hasOwnProperty.call(toolSchemas, value);
}

export type ToolArgs<T extends ToolName> = z.infer<(typeof toolSchemas)[T]>;
