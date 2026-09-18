import type { VoiceBackend, VoiceContext, VoiceTurn } from './backend.js';
import { parseIntent, smallTalk } from './understanding/intent.js';
import { normalize } from './understanding/normalize.js';

const HOLD = /\b(hold|stop|wait|freeze|hold on)\b/;

/**
 * The no-API-key understanding path.
 *
 * Speech capture and playback happen in the browser; this backend does the
 * understanding with deterministic rules, which keeps OnCue fully demoable
 * without credentials. It also sets the bar for how terse Higgs replies must
 * be: OnCue answers "Daniel ready.", never a sentence about being happy to help.
 */
export class SimulatedVoiceBackend implements VoiceBackend {
  readonly name = 'simulated' as const;
  readonly ready = true;

  async handleUtterance(text: string, context: VoiceContext): Promise<VoiceTurn> {
    const normalized = normalize(text);
    if (!normalized) return { say: null, toolCalls: [], hold: false };

    if (HOLD.test(normalized)) return { say: 'Holding.', toolCalls: [], hold: true };

    const toolCalls = parseIntent(text, context);
    if (toolCalls?.length) {
      // The spoken reply comes from the tool result, so it always matches
      // what actually happened rather than what was requested.
      return { say: null, toolCalls, hold: false };
    }

    const reply = smallTalk(text, context);
    return { say: reply ?? "I didn't catch that.", toolCalls: [], hold: false };
  }
}
