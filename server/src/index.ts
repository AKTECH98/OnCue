import { createServer } from 'node:http';

import type { ToolInvocationResult, ToolSource } from '@oncue/shared';

import { env } from './config/env.js';
import { createRouter } from './http/routes.js';
import { BroadcastStore } from './state/store.js';
import { tracer, type TracingHealth } from './tracing/tracer.js';
import { createRealtimeServer } from './websocket/realtime-server.js';

const store = new BroadcastStore();
store.startClock();

let tracingHealth: TracingHealth | null = null;

/**
 * Phase 0 placeholder. Phase 2 registers the deterministic broadcast tools and
 * Phase 3 routes them through LangGraph; the signature stays identical.
 */
const executeTool = async (
  tool: string,
  _args: Record<string, unknown>,
  _source: ToolSource,
): Promise<ToolInvocationResult> => ({
  ok: false,
  tool,
  message: `Tool "${tool}" is not registered yet.`,
  path: ['dispatch', 'unregistered'],
  durationMs: 0,
  errorCode: 'tool_not_registered',
});

const router = createRouter({ store, tracingHealth: () => tracingHealth, executeTool });
const httpServer = createServer((req, res) => {
  void router(req, res).catch(() => {
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: false, message: 'Internal server error' }));
  });
});

const realtime = createRealtimeServer({ httpServer, store, executeTool });

httpServer.listen(env.PORT, env.HOST, async () => {
  tracingHealth = await tracer.health();
  const lines = [
    '',
    '  OnCue server',
    `  http      http://127.0.0.1:${env.PORT}`,
    `  websocket ws://127.0.0.1:${env.PORT}/ws`,
    `  higgs     ${env.higgsEnabled ? 'configured' : 'simulated (no HIGGS_API_KEY)'}`,
    `  tracing   ${tracingHealth.mode} — ${tracingHealth.detail}`,
    '',
  ];
  console.log(lines.join('\n'));
});

const shutdown = async (): Promise<void> => {
  store.stopClock();
  await realtime.close();
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
};

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
