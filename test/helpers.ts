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
    ...overrides
  };
}
