import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app';
import { makeConfig } from './helpers';

describe('GET /budgets', () => {
  it('returns budgets visible to service account', async () => {
    const config = makeConfig();

    const app = buildApp(config, {
      actualClientFactory: {
        ping: vi.fn().mockResolvedValue(undefined)
      },
      budgetService: {
        listBudgets: vi.fn().mockResolvedValue([
          { id: 'budget_abc', name: 'Main Budget' },
          { id: 'budget_xyz', name: 'Trips' }
        ])
      },
      entryService: {
        listEntries: vi.fn(),
        createEntry: vi.fn()
      }
    });

    const response = await request(app.server)
      .get('/budgets')
      .set('Authorization', `Bearer ${config.bridgeApiKey}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      { id: 'budget_abc', name: 'Main Budget' },
      { id: 'budget_xyz', name: 'Trips' }
    ]);

    await app.close();
  });
});
