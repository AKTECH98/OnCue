import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';
import { z } from 'zod';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');

for (const candidate of [resolve(repoRoot, '.env'), resolve(repoRoot, 'server/.env')]) {
  if (existsSync(candidate)) dotenv.config({ path: candidate });
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(43128),
  HOST: z.string().default('0.0.0.0'),
  CLIENT_ORIGIN: z.string().default('*'),

  HIGGS_API_KEY: z.string().default(''),
  HIGGS_REALTIME_URL: z.string().default('wss://api.higgsfield.ai/v1/realtime'),
  HIGGS_MODEL: z.string().default('higgs-realtime'),
  HIGGS_VOICE: z.string().default('broadcast'),

  LANGSMITH_TRACING: z
    .string()
    .default('false')
    .transform((value) => value === 'true' || value === '1'),
  LANGSMITH_API_KEY: z.string().default(''),
  LANGSMITH_PROJECT: z.string().default('oncue'),
  LANGSMITH_ENDPOINT: z.string().default('https://api.smith.langchain.com'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

const raw = parsed.data;

export const env = {
  ...raw,
  /** Higgs is optional: without a key OnCue runs a deterministic simulated voice path. */
  higgsEnabled: raw.HIGGS_API_KEY.trim().length > 0,
  /** LangSmith is optional: without a key traces stay in the in-memory buffer. */
  langsmithEnabled: raw.LANGSMITH_TRACING && raw.LANGSMITH_API_KEY.trim().length > 0,
} as const;

export type Env = typeof env;
