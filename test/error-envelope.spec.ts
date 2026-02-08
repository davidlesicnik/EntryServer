import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app';
import { UpstreamError } from '../src/errors';
import { makeConfig } from './helpers';

describe('error envelope', () => {
  it('does not expose internal details for 5xx responses', async () => {
    const config = makeConfig();
    const app = buildApp(config, {
      actualClientFactory: {
        ping: vi.fn().mockResolvedValue(undefined)
      },
      budgetService: {
        listBudgets: vi.fn().mockResolvedValue([{ id: 'budget_abc', name: 'Main Budget' }])
      },
      entryService: {
        listEntries: vi.fn().mockRejectedValue(new UpstreamError('Actual failed', { secret: 'token-123' })),
        createEntry: vi.fn()
      }
    });

    const response = await request(app.server)
      .get('/budgets/budget_abc/entries?from=2026-02-01&to=2026-02-28&flow=all&limit=100&offset=0')
      .set('Authorization', `Bearer ${config.bridgeApiKey}`);

    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe('upstream_error');
    expect(response.body.error.details).toBeUndefined();

    await app.close();
  });

  it('keeps validation details for 4xx responses', async () => {
    const config = makeConfig();
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

    const response = await request(app.server)
      .get('/budgets/budget_abc/entries?from=bad&to=2026-02-28&flow=all&limit=100&offset=0')
      .set('Authorization', `Bearer ${config.bridgeApiKey}`);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('validation_error');
    expect(response.body.error.details).toBeTruthy();

    await app.close();
  });
});
