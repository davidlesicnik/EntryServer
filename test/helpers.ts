import type { AppConfig } from '../src/config';

export function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 3000,
    logLevel: 'silent',
    bridgeApiKey: 'test-api-key',
    actualServerUrl: 'http://actual.local',
    actualPassword: 'password',
    actualFilePassword: undefined,
    budgetDiscoveryMode: 'configured',
    configuredBudgets: [{ id: 'budget_abc', name: 'Main Budget' }],
    lockTimeoutMs: 200,
    requestTimeoutMs: 15000,
    bodyLimitBytes: 1048576,
    idempotencyTtlMs: 86400000,
    idempotencyMaxRecords: 10000,
    authFailureWindowMs: 60000,
    authMaxAttempts: 10,
    authBlockMs: 300000,
    authStateTtlMs: 900000,
    authMaxTrackedClients: 10000,
    requestRateLimitWindowMs: 60000,
    requestRateLimitMaxRequests: 600,
    requestRateLimitStateTtlMs: 300000,
    requestRateLimitMaxTrackedClients: 10000,
    ...overrides
  };
}
