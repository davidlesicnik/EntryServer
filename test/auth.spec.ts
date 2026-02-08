import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app';
import { makeConfig } from './helpers';

describe('API key auth', () => {
  const dependencies = {
    actualClientFactory: {
      ping: vi.fn().mockResolvedValue(undefined)
    },
    budgetService: {
      listBudgets: vi.fn().mockResolvedValue([{ id: 'budget_abc', name: 'Main Budget' }])
    },
    entryService: {
      listEntries: vi.fn(),
      createEntry: vi.fn()
    }
  };

  let app = buildApp(makeConfig(), dependencies);
  let config = makeConfig();

  beforeEach(async () => {
    await app.close();
    config = makeConfig();
    app = buildApp(config, dependencies);
  });

  afterEach(async () => {
    dependencies.budgetService.listBudgets.mockClear();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects missing API key for protected route', async () => {
    const response = await request(app.server).get('/budgets');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('unauthorized');
  });

  it('rejects invalid API key for protected route', async () => {
    const response = await request(app.server)
      .get('/budgets')
      .set('Authorization', 'Bearer wrong');
    expect(response.status).toBe(401);
  });

  it('accepts case-insensitive bearer scheme and extra internal spaces', async () => {
    const response = await request(app.server)
      .get('/budgets')
      .set('Authorization', `bEaReR    ${config.bridgeApiKey}`);

    expect(response.status).toBe(200);
  });

  it('rejects malformed bearer values with extra tokens', async () => {
    const response = await request(app.server)
      .get('/budgets')
      .set('Authorization', `Bearer ${config.bridgeApiKey} extra`);

    expect(response.status).toBe(401);
  });

  it('allows /health without API key', async () => {
    const response = await request(app.server).get('/health');
    expect(response.status).toBe(200);
  });

  it('allows valid API key', async () => {
    const response = await request(app.server)
      .get('/budgets')
      .set('Authorization', `Bearer ${config.bridgeApiKey}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([{ id: 'budget_abc', name: 'Main Budget' }]);
  });

  it('returns 429 after repeated invalid attempts from same client', async () => {
    await app.close();
    config = makeConfig({
      authMaxAttempts: 2,
      authFailureWindowMs: 60_000,
      authBlockMs: 120_000
    });
    app = buildApp(config, dependencies);

    const first = await request(app.server)
      .get('/budgets')
      .set('Authorization', 'Bearer wrong-1');
    expect(first.status).toBe(401);

    const second = await request(app.server)
      .get('/budgets')
      .set('Authorization', 'Bearer wrong-2');
    expect(second.status).toBe(429);
    expect(second.body.error.code).toBe('rate_limited');
  });
});
