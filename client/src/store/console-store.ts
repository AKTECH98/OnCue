import type {
  BroadcastState,
  ServerMessage,
  ToolInvocationResult,
  ToolSource,
  TraceEntry,
  TranscriptEntry,
} from '@oncue/shared';
import { create } from 'zustand';

import type { VoiceActivity } from '@oncue/shared';

import { defaultServerUrl, RealtimeConnection, type ConnectionStatus } from '@/realtime/connection';
import { VoiceController } from '@/realtime/voice-controller';

const MAX_TRACES = 40;
const MAX_TRANSCRIPT = 12;

interface ConsoleStore {
  connection: ConnectionStatus;
  simulatedVoice: boolean;
  state: BroadcastState | null;
  traces: TraceEntry[];
  transcript: TranscriptEntry[];
  lastResult: ToolInvocationResult | null;
  diagnosticsOpen: boolean;

  voiceSupported: boolean;
  voiceListening: boolean;
  voiceActivity: VoiceActivity;
  voiceError: string | null;

  connect: () => void;
  disconnect: () => void;
  startListening: () => void;
  stopListening: () => void;
  sendUtterance: (text: string) => void;
  invoke: (
    tool: string,
    args?: Record<string, unknown>,
    source?: ToolSource,
  ) => Promise<ToolInvocationResult>;
  resetShow: () => void;
  toggleDiagnostics: () => void;
}

let connection: RealtimeConnection | null = null;
let voice: VoiceController | null = null;

/** Built lazily so the browser never asks for a microphone until asked to. */
function ensureVoice(set: (partial: Partial<ConsoleStore>) => void): VoiceController {
  voice ??= new VoiceController({
    onUtterance: (text, final) => {
      connection?.send({ type: 'voice:utterance', text, final });
    },
    onInterrupt: (reason) => {
      connection?.send({ type: 'voice:interrupt', reason });
    },
    onListeningChange: (listening) => {
      set({ voiceListening: listening, voiceActivity: listening ? 'listening' : 'idle' });
      connection?.send({ type: 'voice:listening', listening });
    },
    onSpeakingChange: (speaking) => {
      set({ voiceActivity: speaking ? 'speaking' : 'listening' });
    },
    onError: (message) => set({ voiceError: message }),
  });
  return voice;
}

export const useConsoleStore = create<ConsoleStore>((set, get) => ({
  connection: 'closed',
  simulatedVoice: true,
  state: null,
  traces: [],
  transcript: [],
  lastResult: null,
  diagnosticsOpen: false,

  voiceSupported: VoiceController.supported,
  voiceListening: false,
  voiceActivity: 'idle',
  voiceError: null,

  connect: () => {
    if (connection) return;
    connection = new RealtimeConnection(defaultServerUrl(), {
      onStatus: (status) => set({ connection: status }),
      onMessage: (message: ServerMessage) => {
        switch (message.type) {
          case 'server:hello':
            set({ simulatedVoice: message.simulatedVoice });
            break;
          case 'state:snapshot':
            set((current) =>
              current.state && current.state.revision > message.state.revision
                ? current
                : { state: message.state },
            );
            break;
          case 'tool:result':
            set({ lastResult: message.result });
            break;
          case 'trace':
            set((current) => ({ traces: [message.entry, ...current.traces].slice(0, MAX_TRACES) }));
            break;
          case 'transcript':
            set((current) => ({
              transcript: [message.entry, ...current.transcript].slice(0, MAX_TRANSCRIPT),
            }));
            break;
          case 'voice:activity':
            set({ voiceActivity: message.activity });
            break;
          case 'voice:say':
            voice?.speak(message.text);
            break;
          case 'voice:stop':
            voice?.cancelSpeech();
            break;
          default:
            break;
        }
      },
    });
    connection.connect();
  },

  disconnect: () => {
    voice?.dispose();
    voice = null;
    connection?.disconnect();
    connection = null;
    set({ connection: 'closed', voiceListening: false, voiceActivity: 'idle' });
  },

  startListening: () => {
    set({ voiceError: null });
    ensureVoice(set).start();
  },

  stopListening: () => {
    voice?.stop();
    voice?.cancelSpeech();
  },

  /** Typed commands take exactly the same path as spoken ones. */
  sendUtterance: (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    ensureVoice(set);
    connection?.send({ type: 'voice:utterance', text: trimmed, final: true });
  },

  invoke: async (tool, args = {}, source: ToolSource = 'manual') => {
    if (!connection) {
      return {
        ok: false,
        tool,
        message: 'Not connected to the OnCue server.',
        path: ['client'],
        durationMs: 0,
        errorCode: 'disconnected',
      };
    }
    const result = await connection.invokeTool(tool, args, source);
    set({ lastResult: result });
    return result;
  },

  resetShow: () => connection?.resetShow(),

  toggleDiagnostics: () => set({ diagnosticsOpen: !get().diagnosticsOpen }),
}));

/** Narrow selectors keep components from re-rendering on unrelated state churn. */
export const selectShow = (s: ConsoleStore) => s.state?.show ?? null;
export const selectVideo = (s: ConsoleStore) => s.state?.video ?? null;
export const selectSpeakers = (s: ConsoleStore) => s.state?.speakers ?? null;
export const selectAudio = (s: ConsoleStore) => s.state?.audio ?? null;
export const selectGraphics = (s: ConsoleStore) => s.state?.graphics ?? null;
export const selectCues = (s: ConsoleStore) => s.state?.cueEngine ?? null;
export const selectSystem = (s: ConsoleStore) => s.state?.system ?? null;
