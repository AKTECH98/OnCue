export interface VoiceControllerHandlers {
  onUtterance: (text: string, final: boolean) => void;
  onInterrupt: (reason: 'barge_in' | 'hold') => void;
  onListeningChange: (listening: boolean) => void;
  onSpeakingChange: (speaking: boolean) => void;
  onError: (message: string) => void;
}

/** Said mid-sentence, these must stop OnCue before the utterance even ends. */
const IMMEDIATE_STOP = /\b(hold|stop|wait|freeze)\b/i;

/**
 * Microphone capture and speech output in the browser.
 *
 * Runs on the Web Speech API so OnCue has a real, interruptible voice loop
 * with no credentials. When Higgs is configured the server drives the same
 * events and this controller only handles playback.
 */
export class VoiceController {
  private recognition: SpeechRecognition | null = null;
  private wantsToListen = false;
  private speaking = false;
  private lastPartial = '';

  constructor(private readonly handlers: VoiceControllerHandlers) {}

  static get supported(): boolean {
    if (typeof window === 'undefined') return false;
    return Boolean(window.SpeechRecognition ?? window.webkitSpeechRecognition);
  }

  get listening(): boolean {
    return this.wantsToListen;
  }

  start(): void {
    if (this.wantsToListen) return;

    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) {
      this.handlers.onError('This browser cannot capture speech. Use the command box instead.');
      return;
    }

    const recognition = new Recognition();
    recognition.lang = 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onspeechstart = () => {
      // Barge-in: the operator always wins the floor.
      if (this.speaking) {
        this.cancelSpeech();
        this.handlers.onInterrupt('barge_in');
      }
    };

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (!result) continue;
        const text = result[0]?.transcript?.trim() ?? '';
        if (!text) continue;

        if (result.isFinal) {
          this.lastPartial = '';
          this.handlers.onUtterance(text, true);
        } else if (text !== this.lastPartial) {
          this.lastPartial = text;
          if (IMMEDIATE_STOP.test(text)) {
            this.cancelSpeech();
            this.handlers.onInterrupt('hold');
          }
          this.handlers.onUtterance(text, false);
        }
      }
    };

    recognition.onerror = (event) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      if (event.error === 'not-allowed') {
        this.wantsToListen = false;
        this.handlers.onListeningChange(false);
        this.handlers.onError('Microphone access was blocked. Allow it and press Listen again.');
        return;
      }
      this.handlers.onError(`Speech recognition error: ${event.error}`);
    };

    // Chrome ends the session after a pause; restart while the operator wants to talk.
    recognition.onend = () => {
      if (!this.wantsToListen) return;
      try {
        recognition.start();
      } catch {
        this.wantsToListen = false;
        this.handlers.onListeningChange(false);
      }
    };

    this.recognition = recognition;
    this.wantsToListen = true;
    this.handlers.onListeningChange(true);

    try {
      recognition.start();
    } catch {
      this.wantsToListen = false;
      this.handlers.onListeningChange(false);
      this.handlers.onError('Could not start the microphone.');
    }
  }

  stop(): void {
    this.wantsToListen = false;
    this.handlers.onListeningChange(false);
    this.recognition?.abort();
    this.recognition = null;
  }

  speak(text: string): void {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.15;
    utterance.pitch = 0.95;
    utterance.volume = 0.9;

    utterance.onstart = () => {
      this.speaking = true;
      this.handlers.onSpeakingChange(true);
    };
    const finish = () => {
      this.speaking = false;
      this.handlers.onSpeakingChange(false);
    };
    utterance.onend = finish;
    utterance.onerror = finish;

    window.speechSynthesis.speak(utterance);
  }

  cancelSpeech(): void {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    if (this.speaking) {
      this.speaking = false;
      this.handlers.onSpeakingChange(false);
    }
  }

  dispose(): void {
    this.stop();
    this.cancelSpeech();
  }
}
