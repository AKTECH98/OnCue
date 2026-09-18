import type { VoiceBackend, VoiceContext, VoiceTurn } from './backend.js';
import {
  describeCalls,
  emptyMemory,
  interpret,
  rememberFrom,
  smallTalk,
  type ConversationMemory,
} from './understanding/intent.js';
import { normalize } from './understanding/normalize.js';
import { planUtterance } from './understanding/plan.js';

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

    const plan = planUtterance(text, {
      context,
      memory: this.memory,
      interpretClause: interpret,
      rememberFrom,
      describe: (calls, _clause, ctx) => describeCalls(calls, ctx),
    });
    this.memory = plan.memory;

    const deferred = plan.steps.some((step) => step.trigger.type !== 'immediate');

    // A multi-part instruction becomes a visible plan; a single command just runs.
    if (plan.steps.length > 1 || deferred) {
      return { say: plan.say, toolCalls: [], steps: plan.steps, hold: false };
    }

    const only = plan.steps[0];
    if (only) {
      return { say: plan.say, toolCalls: only.calls, hold: false };
    }

    const reply = plan.say ?? smallTalk(text, context);
    return { say: reply ?? "I didn't catch that.", toolCalls: [], hold: false };
  }

  resetMemory(): void {
    this.memory = emptyMemory();
  }
}
