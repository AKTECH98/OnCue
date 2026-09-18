import type { Server as HttpServer } from 'node:http';

import {
  PROTOCOL_VERSION,
  type BroadcastState,
  type ClientMessage,
  type ServerMessage,
  type ToolInvocationResult,
  type ToolSource,
} from '@oncue/shared';
import { WebSocketServer, type WebSocket } from 'ws';

import { env } from '../config/env.js';
import type { BroadcastStore } from '../state/store.js';
import { tracer } from '../tracing/tracer.js';

export type ToolExecutor = (
  tool: string,
  args: Record<string, unknown>,
  source: ToolSource,
) => Promise<ToolInvocationResult>;

export interface RealtimeServerOptions {
  httpServer: HttpServer;
  store: BroadcastStore;
  executeTool: ToolExecutor;
}

export interface RealtimeServer {
  clientCount(): number;
  broadcast(message: ServerMessage): void;
  close(): Promise<void>;
}

export function createRealtimeServer({
  httpServer,
  store,
  executeTool,
}: RealtimeServerOptions): RealtimeServer {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  const clients = new Set<WebSocket>();

  const send = (socket: WebSocket, message: ServerMessage): void => {
    if (socket.readyState !== socket.OPEN) return;
    socket.send(JSON.stringify(message));
  };

  const broadcast = (message: ServerMessage): void => {
    const payload = JSON.stringify(message);
    for (const socket of clients) {
      if (socket.readyState === socket.OPEN) socket.send(payload);
    }
  };

  const unsubscribeState = store.subscribe((state: BroadcastState) => {
    broadcast({ type: 'state:snapshot', state });
  });

  const unsubscribeTraces = tracer.subscribe((entry) => {
    broadcast({ type: 'trace', entry });
  });

  wss.on('connection', (socket) => {
    clients.add(socket);

    send(socket, {
      type: 'server:hello',
      serverTimeMs: Date.now(),
      simulatedVoice: !env.higgsEnabled,
      protocolVersion: PROTOCOL_VERSION,
    });
    send(socket, { type: 'state:snapshot', state: store.getState() });

    socket.on('message', (raw) => {
      let message: ClientMessage;
      try {
        message = JSON.parse(raw.toString()) as ClientMessage;
      } catch {
        send(socket, { type: 'error', code: 'bad_json', message: 'Message was not valid JSON.' });
        return;
      }
      void handleMessage(socket, message);
    });

    socket.on('close', () => clients.delete(socket));
    socket.on('error', () => clients.delete(socket));
  });

  async function handleMessage(socket: WebSocket, message: ClientMessage): Promise<void> {
    switch (message.type) {
      case 'client:hello':
      case 'state:request':
        send(socket, { type: 'state:snapshot', state: store.getState() });
        return;

      case 'show:reset':
        store.reset();
        send(socket, {
          type: 'tool:result',
          requestId: null,
          result: {
            ok: true,
            tool: 'reset_show',
            message: 'Show reset to the rehearsal state.',
            path: ['reset'],
            durationMs: 0,
          },
        });
        return;

      case 'tool:invoke': {
        const result = await executeTool(message.tool, message.args ?? {}, message.source);
        send(socket, { type: 'tool:result', requestId: message.requestId, result });
        return;
      }

      default:
        send(socket, {
          type: 'error',
          code: 'unknown_message',
          message: `Unsupported message type: ${(message as { type: string }).type}`,
        });
    }
  }

  return {
    clientCount: () => clients.size,
    broadcast,
    close: () =>
      new Promise<void>((resolve) => {
        unsubscribeState();
        unsubscribeTraces();
        for (const socket of clients) socket.close();
        wss.close(() => resolve());
      }),
  };
}
