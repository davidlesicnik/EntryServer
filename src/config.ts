import { z } from 'zod';
import { ConfigError } from './errors';

const budgetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1)
});

const envSchema = z
  .object({
    PORT: z.coerce.number().int().positive().default(3000),
    LOG_LEVEL: z.string().default('info'),
    BRIDGE_API_KEY: z.string().min(1),
    ACTUAL_SERVER_URL: z.string().url(),
    ACTUAL_PASSWORD: z.string().min(1),
    ACTUAL_FILE_PASSWORD: z.string().min(1).optional(),
    ENTRYSERVER_BUDGET_DISCOVERY_MODE: z.enum(['auto', 'configured']).default('auto'),
    ENTRYSERVER_BUDGETS_JSON: z.string().optional(),
    ENTRYSERVER_LOCK_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
    ENTRYSERVER_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
    ENTRYSERVER_BODY_LIMIT_BYTES: z.coerce.number().int().positive().default(1048576),
    ENTRYSERVER_IDEMPOTENCY_TTL_MS: z.coerce.number().int().positive().default(86400000),
    ENTRYSERVER_IDEMPOTENCY_MAX_RECORDS: z.coerce.number().int().positive().default(10000),
    ENTRYSERVER_AUTH_FAILURE_WINDOW_MS: z.coerce.number().int().positive().default(60000),
    ENTRYSERVER_AUTH_MAX_ATTEMPTS: z.coerce.number().int().positive().default(10),
    ENTRYSERVER_AUTH_BLOCK_MS: z.coerce.number().int().positive().default(300000),
    ENTRYSERVER_AUTH_STATE_TTL_MS: z.coerce.number().int().positive().default(900000),
    ENTRYSERVER_AUTH_MAX_TRACKED_CLIENTS: z.coerce.number().int().positive().default(10000),
    ENTRYSERVER_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
    ENTRYSERVER_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(600),
    ENTRYSERVER_RATE_LIMIT_STATE_TTL_MS: z.coerce.number().int().positive().default(300000),
    ENTRYSERVER_RATE_LIMIT_MAX_TRACKED_CLIENTS: z.coerce.number().int().positive().default(10000)
  })
  .passthrough();

export interface BudgetConfigItem {
  id: string;
  name: string;
}

export interface AppConfig {
  port: number;
  logLevel: string;
  bridgeApiKey: string;
  actualServerUrl: string;
  actualPassword: string;
  actualFilePassword?: string;
  budgetDiscoveryMode: 'auto' | 'configured';
  configuredBudgets: BudgetConfigItem[];
  lockTimeoutMs: number;
  requestTimeoutMs: number;
  bodyLimitBytes: number;
  idempotencyTtlMs: number;
  idempotencyMaxRecords: number;
  authFailureWindowMs: number;
  authMaxAttempts: number;
  authBlockMs: number;
  authStateTtlMs: number;
  authMaxTrackedClients: number;
  requestRateLimitWindowMs: number;
  requestRateLimitMaxRequests: number;
  requestRateLimitStateTtlMs: number;
  requestRateLimitMaxTrackedClients: number;
}

function parseConfiguredBudgets(raw?: string): BudgetConfigItem[] {
  if (!raw) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ConfigError('ENTRYSERVER_BUDGETS_JSON must be valid JSON');
  }

  const result = z.array(budgetSchema).safeParse(parsed);
  if (!result.success) {
    throw new ConfigError('ENTRYSERVER_BUDGETS_JSON must be an array of {id,name}');
  }

  return result.data;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsedEnv = envSchema.safeParse(env);
  if (!parsedEnv.success) {
    throw new ConfigError('Invalid environment configuration', parsedEnv.error.flatten());
  }

  const configuredBudgets = parseConfiguredBudgets(parsedEnv.data.ENTRYSERVER_BUDGETS_JSON);

  if (parsedEnv.data.ENTRYSERVER_BUDGET_DISCOVERY_MODE === 'configured' && configuredBudgets.length === 0) {
    throw new ConfigError('Configured budget discovery mode requires ENTRYSERVER_BUDGETS_JSON');
  }

  return {
    port: parsedEnv.data.PORT,
    logLevel: parsedEnv.data.LOG_LEVEL,
    bridgeApiKey: parsedEnv.data.BRIDGE_API_KEY,
    actualServerUrl: parsedEnv.data.ACTUAL_SERVER_URL,
    actualPassword: parsedEnv.data.ACTUAL_PASSWORD,
    actualFilePassword: parsedEnv.data.ACTUAL_FILE_PASSWORD,
    budgetDiscoveryMode: parsedEnv.data.ENTRYSERVER_BUDGET_DISCOVERY_MODE,
    configuredBudgets,
    lockTimeoutMs: parsedEnv.data.ENTRYSERVER_LOCK_TIMEOUT_MS,
    requestTimeoutMs: parsedEnv.data.ENTRYSERVER_REQUEST_TIMEOUT_MS,
    bodyLimitBytes: parsedEnv.data.ENTRYSERVER_BODY_LIMIT_BYTES,
    idempotencyTtlMs: parsedEnv.data.ENTRYSERVER_IDEMPOTENCY_TTL_MS,
    idempotencyMaxRecords: parsedEnv.data.ENTRYSERVER_IDEMPOTENCY_MAX_RECORDS,
    authFailureWindowMs: parsedEnv.data.ENTRYSERVER_AUTH_FAILURE_WINDOW_MS,
    authMaxAttempts: parsedEnv.data.ENTRYSERVER_AUTH_MAX_ATTEMPTS,
    authBlockMs: parsedEnv.data.ENTRYSERVER_AUTH_BLOCK_MS,
    authStateTtlMs: parsedEnv.data.ENTRYSERVER_AUTH_STATE_TTL_MS,
    authMaxTrackedClients: parsedEnv.data.ENTRYSERVER_AUTH_MAX_TRACKED_CLIENTS,
    requestRateLimitWindowMs: parsedEnv.data.ENTRYSERVER_RATE_LIMIT_WINDOW_MS,
    requestRateLimitMaxRequests: parsedEnv.data.ENTRYSERVER_RATE_LIMIT_MAX_REQUESTS,
    requestRateLimitStateTtlMs: parsedEnv.data.ENTRYSERVER_RATE_LIMIT_STATE_TTL_MS,
    requestRateLimitMaxTrackedClients: parsedEnv.data.ENTRYSERVER_RATE_LIMIT_MAX_TRACKED_CLIENTS
  };
}
