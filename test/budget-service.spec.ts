import { describe, expect, it, vi } from 'vitest';
import { BudgetService } from '../src/actual/budgetService';
import { makeConfig } from './helpers';

describe('BudgetService', () => {
  it('filters auto-discovered budgets through configured allowlist when configured budgets exist', async () => {
    const config = makeConfig({
      budgetDiscoveryMode: 'auto',
      configuredBudgets: [{ id: 'budget_allowed', name: 'Allowed' }]
    });

    const service = new BudgetService(config, {
      listBudgets: vi.fn().mockResolvedValue([
        { id: 'budget_allowed', name: 'Allowed Name From Actual' },
        { id: 'budget_denied', name: 'Denied' }
      ]),
      withBudget: vi.fn(async () => undefined),
      ping: vi.fn(async () => undefined),
      shutdown: vi.fn(async () => undefined)
    });

    const budgets = await service.listBudgets();

    expect(budgets).toEqual([{ id: 'budget_allowed', name: 'Allowed Name From Actual' }]);
  });
});
