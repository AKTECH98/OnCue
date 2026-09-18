import type { ClientMessage, ServerMessage, ToolInvocationResult, ToolSource } from '@oncue/shared';

export type ConnectionStatus = 'connecting' | 'open' | 'closed' | 'error';

interface PendingCall {
  resolve: (result: ToolInvocationResult) => void;
  timeout: ReturnType<typeof setTimeout>;
}

const CALL_TIMEOUT_MS = 8000;
const RECONNECT_DELAYS_MS = [400, 800, 1600, 3000, 5000];

/**
 * A single long-lived WebSocket to the OnCue server with automatic reconnect.
 * Tool invocations are request/response pairs correlated by `requestId`.
 */
export class RealtimeConnection {
  private socket: WebSocket | null = null;
  private attempt = 0;
  private closedByUs = false;
  private readonly pending = new Map<string, PendingCall>();

  constructor(
    private readonly url: string,
    private readonly handlers: {
      onMessage: (message: ServerMessage) => void;
      onStatus: (status: ConnectionStatus) => void;
    },
  ) {}

  connect(): void {
    this.closedByUs = false;
    this.handlers.onStatus('connecting');

    const socket = new WebSocket(this.url);
    this.socket = socket;

    socket.addEventListener('open', () => {
      this.attempt = 0;
      this.handlers.onStatus('open');
      this.send({ type: 'client:hello' });
    });

    socket.addEventListener('message', (event) => {
      let message: ServerMessage;
      try {
        message = JSON.parse(String(event.data)) as ServerMessage;
      } catch {
        return;
      }
      if (message.type === 'tool:result' && message.requestId) {
        const pending = this.pending.get(message.requestId);
        if (pending) {
          clearTimeout(pending.timeout);
          this.pending.delete(message.requestId);
          pending.resolve(message.result);
        }
      }
      this.handlers.onMessage(message);
    });

    socket.addEventListener('error', () => this.handlers.onStatus('error'));

    socket.addEventListener('close', () => {
      this.socket = null;
      this.handlers.onStatus('closed');
      if (this.closedByUs) return;
      const delay = RECONNECT_DELAYS_MS[Math.min(this.attempt, RECONNECT_DELAYS_MS.length - 1)]!;
      this.attempt += 1;
      setTimeout(() => this.connect(), delay);
    });
  }

  disconnect(): void {
    this.closedByUs = true;
    this.socket?.close();
    this.socket = null;
  }

  send(message: ClientMessage): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify(message));
  }

  invokeTool(
    tool: string,
    args: Record<string, unknown> = {},
    source: ToolSource = 'manual',
  ): Promise<ToolInvocationResult> {
    const requestId = crypto.randomUUID();
    return new Promise<ToolInvocationResult>((resolve) => {
      if (this.socket?.readyState !== WebSocket.OPEN) {
        resolve({
          ok: false,
          tool,
          message: 'Not connected to the OnCue server.',
          path: ['client'],
          durationMs: 0,
          errorCode: 'disconnected',
        });
        return;
      }
      const timeout = setTimeout(() => {
        this.pending.delete(requestId);
        resolve({
          ok: false,
          tool,
          message: 'The server did not respond in time.',
          path: ['client'],
          durationMs: CALL_TIMEOUT_MS,
          errorCode: 'timeout',
        });
      }, CALL_TIMEOUT_MS);
      this.pending.set(requestId, { resolve, timeout });
      this.send({ type: 'tool:invoke', requestId, tool, args, source });
    });
  }

  resetShow(): void {
    this.send({ type: 'show:reset' });
  }
}

export function defaultServerUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}
