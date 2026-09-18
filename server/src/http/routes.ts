import type { IncomingMessage, ServerResponse } from 'node:http';

import type { ToolInvocationResult, ToolSource } from '@oncue/shared';

import { env } from '../config/env.js';
import type { BroadcastStore } from '../state/store.js';
import { tracer, type TracingHealth } from '../tracing/tracer.js';

export interface RouterOptions {
  store: BroadcastStore;
  tracingHealth: () => TracingHealth | null;
  executeTool: (
    tool: string,
    args: Record<string, unknown>,
    source: ToolSource,
  ) => Promise<ToolInvocationResult>;
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': env.CLIENT_ORIGIN,
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
  });
  res.end(payload);
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
}

/**
 * A deliberately small HTTP surface. The live product speaks WebSocket; these
 * routes exist for health checks, diagnostics and the tool test harness.
 */
export function createRouter({ store, tracingHealth, executeTool }: RouterOptions) {
  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

    if (req.method === 'OPTIONS') {
      json(res, 204, null);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/health') {
      json(res, 200, {
        ok: true,
        service: 'oncue-server',
        higgs: env.higgsEnabled ? 'configured' : 'simulated',
        tracing: tracingHealth(),
        revision: store.getState().revision,
        uptimeSec: Math.round(process.uptime()),
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/state') {
      json(res, 200, store.getState());
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/traces') {
      json(res, 200, { traces: tracer.list(Number(url.searchParams.get('limit') ?? 50)) });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/reset') {
      json(res, 200, store.reset());
      return;
    }

    if (req.method === 'POST' && url.pathname.startsWith('/api/tools/')) {
      const tool = url.pathname.slice('/api/tools/'.length);
      try {
        const args = await readJsonBody(req);
        const result = await executeTool(tool, args, 'test');
        json(res, result.ok ? 200 : 422, result);
      } catch (error) {
        json(res, 400, {
          ok: false,
          tool,
          message: error instanceof Error ? error.message : 'Malformed request body.',
          path: ['http'],
          durationMs: 0,
          errorCode: 'bad_request',
        });
      }
      return;
    }

    json(res, 404, { ok: false, message: `No route for ${req.method} ${url.pathname}` });
  };
}
