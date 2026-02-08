import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app';
import { makeConfig } from './helpers';

describe('entries routes', () => {
  it('returns GET /entries payload', async () => {
    const config = makeConfig();
    const listEntries = vi.fn().mockResolvedValue({
      items: [
        {
          id: 'txn_1',
          budgetId: 'budget_abc',
          amount: 12.34,
          flow: 'expense',
          date: '2026-02-08',
          payee: 'Coffee Shop',
          category: 'Dining',
          account: 'Checking',
          notes: 'Team meeting'
        }
      ],
      limit: 100,
      offset: 0,
      total: 1
    });

    const app = buildApp(config, {
      actualClientFactory: {
        ping: vi.fn().mockResolvedValue(undefined)
      },
      budgetService: {
        listBudgets: vi.fn().mockResolvedValue([{ id: 'budget_abc', name: 'Main Budget' }])
      },
      entryService: {
        listEntries,
        createEntry: vi.fn()
      }
    });

    const response = await request(app.server)
      .get('/budgets/budget_abc/entries?from=2026-02-01&to=2026-02-28&flow=all&limit=100&offset=0')
      .set('Authorization', `Bearer ${config.bridgeApiKey}`);

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);
    expect(listEntries).toHaveBeenCalledWith({
      budgetId: 'budget_abc',
      from: '2026-02-01',
      to: '2026-02-28',
      flow: 'all',
      limit: 100,
      offset: 0
    });

    await app.close();
  });

  it('creates entry with POST /entries payload', async () => {
    const config = makeConfig();
    const createEntry = vi.fn().mockResolvedValue({
      id: 'txn_123',
      budgetId: 'budget_abc',
      amount: 12.34,
      flow: 'expense',
      date: '2026-02-08',
      payee: 'Coffee Shop',
      category: 'Dining',
      account: 'Checking',
      notes: 'Team meeting'
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
        createEntry
      }
    });

    const payload = {
      amount: 12.34,
      flow: 'expense',
      date: '2026-02-08',
      payee: 'Coffee Shop',
      category: 'Dining',
      account: 'Checking',
      notes: 'Team meeting'
    };

    const response = await request(app.server)
      .post('/budgets/budget_abc/entries')
      .set('Authorization', `Bearer ${config.bridgeApiKey}`)
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body.id).toBe('txn_123');
    expect(createEntry).toHaveBeenCalledWith({
      budgetId: 'budget_abc',
      ...payload
    });

    await app.close();
  });
});
