import request from 'supertest';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app';
import { makeConfig } from './helpers';

describe('API key auth', () => {
  const config = makeConfig();

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

  const app = buildApp(config, dependencies);

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
});
