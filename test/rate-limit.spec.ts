import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app';
import { makeConfig } from './helpers';

describe('authenticated request rate limiting', () => {
  it('returns 429 when request count exceeds configured limit', async () => {
    const config = makeConfig({
      requestRateLimitWindowMs: 60_000,
      requestRateLimitMaxRequests: 2
    });

    const app = buildApp(config, {
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
    });

    const first = await request(app.server)
      .get('/budgets')
      .set('Authorization', `Bearer ${config.bridgeApiKey}`);
    expect(first.status).toBe(200);

    const second = await request(app.server)
      .get('/budgets')
      .set('Authorization', `Bearer ${config.bridgeApiKey}`);
    expect(second.status).toBe(200);

    const third = await request(app.server)
      .get('/budgets')
      .set('Authorization', `Bearer ${config.bridgeApiKey}`);
    expect(third.status).toBe(429);
    expect(third.body.error.code).toBe('rate_limited');

    await app.close();
  });

  it('keeps limits isolated by forwarded client identity', async () => {
    const config = makeConfig({
      requestRateLimitWindowMs: 60_000,
      requestRateLimitMaxRequests: 1
    });

    const app = buildApp(config, {
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
    });

    const firstClient = await request(app.server)
      .get('/budgets')
      .set('X-Forwarded-For', '203.0.113.20')
      .set('Authorization', `Bearer ${config.bridgeApiKey}`);
    expect(firstClient.status).toBe(200);

    const firstClientBlocked = await request(app.server)
      .get('/budgets')
      .set('X-Forwarded-For', '203.0.113.20')
      .set('Authorization', `Bearer ${config.bridgeApiKey}`);
    expect(firstClientBlocked.status).toBe(429);

    const secondClient = await request(app.server)
      .get('/budgets')
      .set('X-Forwarded-For', '203.0.113.21')
      .set('Authorization', `Bearer ${config.bridgeApiKey}`);
    expect(secondClient.status).toBe(200);

    await app.close();
  });
});
