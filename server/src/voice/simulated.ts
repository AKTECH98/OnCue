import type { VoiceBackend, VoiceContext, VoiceTurn } from './backend.js';
import {
  emptyMemory,
  interpret,
  rememberFrom,
  smallTalk,
  type ConversationMemory,
} from './understanding/intent.js';
import { normalize } from './understanding/normalize.js';

const HOLD = /\b(hold|stop|wait|freeze)\b/;

/**
 * The no-API-key understanding path.
 *
 * Speech capture and playback happen in the browser; this backend does the
 * understanding with deterministic rules, which keeps OnCue fully demoable
 * without credentials. It also sets the bar for how terse Higgs replies must
 * be: OnCue answers "Daniel ready.", never a sentence about being happy to help.
 *
 * It carries conversational memory across turns, which is what lets the
 * operator say "take him" instead of naming the guest again.
 */
export class SimulatedVoiceBackend implements VoiceBackend {
  readonly name = 'simulated' as const;
  readonly ready = true;

  private memory: ConversationMemory = emptyMemory();

  async handleUtterance(text: string, context: VoiceContext): Promise<VoiceTurn> {
    const normalized = normalize(text);
    if (!normalized) return { say: null, toolCalls: [], hold: false };

    if (HOLD.test(normalized)) return { say: 'Holding.', toolCalls: [], hold: true };

    const understanding = interpret(text, context, this.memory);

    if (understanding) {
      this.memory = rememberFrom(understanding.toolCalls, this.memory);
      return {
        // With tool calls, the reply comes from the result, so OnCue can only
        // claim what actually happened.
        say: understanding.say ?? null,
        toolCalls: understanding.toolCalls,
        hold: understanding.hold ?? false,
      };
    }

    const reply = smallTalk(text, context);
    return { say: reply ?? "I didn't catch that.", toolCalls: [], hold: false };
  }

  resetMemory(): void {
    this.memory = emptyMemory();
  }
}
