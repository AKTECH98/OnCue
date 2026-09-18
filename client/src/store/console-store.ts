import type {
  BroadcastState,
  ServerMessage,
  ToolInvocationResult,
  ToolSource,
  TraceEntry,
  TranscriptEntry,
} from '@oncue/shared';
import { create } from 'zustand';

import { defaultServerUrl, RealtimeConnection, type ConnectionStatus } from '@/realtime/connection';

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

  connect: () => void;
  disconnect: () => void;
  invoke: (
    tool: string,
    args?: Record<string, unknown>,
    source?: ToolSource,
  ) => Promise<ToolInvocationResult>;
  resetShow: () => void;
  toggleDiagnostics: () => void;
}

let connection: RealtimeConnection | null = null;

export const useConsoleStore = create<ConsoleStore>((set, get) => ({
  connection: 'closed',
  simulatedVoice: true,
  state: null,
  traces: [],
  transcript: [],
  lastResult: null,
  diagnosticsOpen: false,

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
          default:
            break;
        }
      },
    });
    connection.connect();
  },

  disconnect: () => {
    connection?.disconnect();
    connection = null;
    set({ connection: 'closed' });
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
