import type { VoiceBackend, VoiceContext, VoiceTurn } from './backend.js';

/**
 * The no-API-key understanding path.
 *
 * Speech capture and speech output happen in the browser; this backend does
 * the understanding with deterministic rules. It keeps OnCue fully demoable
 * without credentials, and it is the reference for how terse Higgs replies
 * should be: a few words, never a paragraph.
 */
export class SimulatedVoiceBackend implements VoiceBackend {
  readonly name = 'simulated' as const;
  readonly ready = true;

  async handleUtterance(text: string, context: VoiceContext): Promise<VoiceTurn> {
    const utterance = text.trim().toLowerCase();

    if (!utterance) return { say: null, toolCalls: [], hold: false };

    if (/\b(hold|stop|wait|freeze)\b/.test(utterance)) {
      return { say: 'Holding.', toolCalls: [], hold: true };
    }

    if (/\b(hello|hey|hi|you there|are you there)\b/.test(utterance)) {
      return { say: 'OnCue here.', toolCalls: [], hold: false };
    }

    if (/\b(thanks|thank you|nice|good work)\b/.test(utterance)) {
      return { say: 'Copy.', toolCalls: [], hold: false };
    }

    if (/\bwhat('?s| is) (on|live|up)\b/.test(utterance)) {
      const speaker = context.activeSpeaker ?? `camera ${context.programCamera}`;
      return { say: `${speaker} on program.`, toolCalls: [], hold: false };
    }

    return { say: 'Standing by.', toolCalls: [], hold: false };
  }
}
