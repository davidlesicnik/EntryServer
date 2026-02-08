import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app';
import { makeConfig } from './helpers';

describe('entries validation', () => {
  it('rejects bad date/amount/flow with 400', async () => {
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

    const res1 = await request(app.server)
      .get('/budgets/budget_abc/entries?from=bad&to=2026-02-08&flow=all&limit=100&offset=0')
      .set('Authorization', `Bearer ${config.bridgeApiKey}`);

    expect(res1.status).toBe(400);

    const res2 = await request(app.server)
      .post('/budgets/budget_abc/entries')
      .set('Authorization', `Bearer ${config.bridgeApiKey}`)
      .send({
        amount: -12.34,
        flow: 'outgoing',
        date: '2026-02-08',
        payee: 'Coffee Shop',
        category: 'Dining',
        account: 'Checking'
      });

    expect(res2.status).toBe(400);

    await app.close();
  });
});
