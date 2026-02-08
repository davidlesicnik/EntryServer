import { describe, expect, it, vi } from 'vitest';
import pino from 'pino';
import { EntryService } from '../src/actual/entryService';
import { BudgetLockManager } from '../src/actual/locks';
import type { ActualBudgetSession, ActualClientFactory, NamedEntity } from '../src/actual/clientFactory';

function makeSession(overrides: Partial<ActualBudgetSession> = {}): ActualBudgetSession {
  const accounts: NamedEntity[] = [{ id: 'acc_1', name: 'Checking' }];
  const categories: NamedEntity[] = [{ id: 'cat_1', name: 'Dining' }];
  const payees: NamedEntity[] = [{ id: 'pay_1', name: 'Coffee Shop' }];

  return {
    sync: vi.fn().mockResolvedValue(undefined),
    getAccounts: vi.fn().mockResolvedValue(accounts),
    getCategories: vi.fn().mockResolvedValue(categories),
    getPayees: vi.fn().mockResolvedValue(payees),
    createPayee: vi.fn().mockImplementation(async (name: string) => ({ id: `pay_${name}`, name })),
    listTransactions: vi.fn().mockResolvedValue([
      {
        id: 'txn_expense',
        date: '2026-02-08',
        amount: -1234,
        accountId: 'acc_1',
        categoryId: 'cat_1',
        payeeId: 'pay_1',
        notes: 'expense item'
      },
      {
        id: 'txn_income',
        date: '2026-02-08',
        amount: 5000,
        accountId: 'acc_1',
        categoryId: 'cat_1',
        payeeId: 'pay_1',
        notes: 'income item'
      }
    ]),
    createTransaction: vi.fn().mockResolvedValue({ id: 'txn_created' }),
    close: vi.fn().mockResolvedValue(undefined),
    ...overrides
  };
}

function makeFactory(session: ActualBudgetSession): ActualClientFactory {
  return {
    listBudgets: async () => [{ id: 'budget_abc', name: 'Main Budget' }],
    withBudget: async <T>(_budgetId: string, fn: (s: ActualBudgetSession) => Promise<T>) => fn(session),
    ping: async () => undefined,
    shutdown: async () => undefined
  };
}

const budgetService = {
  assertBudgetAccessible: vi.fn().mockResolvedValue(undefined)
};

describe('EntryService', () => {
  it('filters by flow for list entries', async () => {
    const session = makeSession();
    const service = new EntryService(
      makeFactory(session),
      budgetService,
      new BudgetLockManager(),
      200,
      pino({ level: 'silent' })
    );

    const income = await service.listEntries({
      budgetId: 'budget_abc',
      from: '2026-02-01',
      to: '2026-02-28',
      flow: 'income',
      limit: 100,
      offset: 0
    });

    const expense = await service.listEntries({
      budgetId: 'budget_abc',
      from: '2026-02-01',
      to: '2026-02-28',
      flow: 'expense',
      limit: 100,
      offset: 0
    });

    const all = await service.listEntries({
      budgetId: 'budget_abc',
      from: '2026-02-01',
      to: '2026-02-28',
      flow: 'all',
      limit: 100,
      offset: 0
    });

    expect(income.items).toHaveLength(1);
    expect(income.items[0]?.flow).toBe('income');

    expect(expense.items).toHaveLength(1);
    expect(expense.items[0]?.flow).toBe('expense');

    expect(all.items).toHaveLength(2);
  });

  it('creates income and expense entries with proper amount sign', async () => {
    const session = makeSession();
    const createTransaction = vi.spyOn(session, 'createTransaction');

    const service = new EntryService(
      makeFactory(session),
      budgetService,
      new BudgetLockManager(),
      200,
      pino({ level: 'silent' })
    );

    await service.createEntry({
      budgetId: 'budget_abc',
      amount: 12.34,
      flow: 'expense',
      date: '2026-02-08',
      payee: 'Coffee Shop',
      category: 'Dining',
      account: 'Checking',
      notes: 'Team meeting'
    });

    await service.createEntry({
      budgetId: 'budget_abc',
      amount: 50,
      flow: 'income',
      date: '2026-02-08',
      payee: 'Coffee Shop',
      category: 'Dining',
      account: 'Checking',
      notes: 'Refund'
    });

    expect(createTransaction).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ amount: -1234 })
    );
    expect(createTransaction).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ amount: 5000 })
    );
  });

  it('returns 404 semantics for unknown account or category', async () => {
    const session = makeSession({
      getAccounts: vi.fn().mockResolvedValue([])
    });

    const service = new EntryService(
      makeFactory(session),
      budgetService,
      new BudgetLockManager(),
      200,
      pino({ level: 'silent' })
    );

    await expect(
      service.createEntry({
        budgetId: 'budget_abc',
        amount: 1,
        flow: 'expense',
        date: '2026-02-08',
        payee: 'Coffee Shop',
        category: 'Dining',
        account: 'Checking',
        notes: ''
      })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('replays create by idempotency key and rejects mismatched payload reuse', async () => {
    const session = makeSession();
    const createTransaction = vi.spyOn(session, 'createTransaction');
    const service = new EntryService(
      makeFactory(session),
      budgetService,
      new BudgetLockManager(),
      200,
      pino({ level: 'silent' }),
      60_000
    );

    const input = {
      budgetId: 'budget_abc',
      amount: 12.34,
      flow: 'expense' as const,
      date: '2026-02-08',
      payee: 'Coffee Shop',
      category: 'Dining',
      account: 'Checking',
      notes: 'Team meeting',
      idempotencyKey: 'idemp-1'
    };

    const first = await service.createEntry(input);
    const second = await service.createEntry(input);

    expect(first.id).toBe(second.id);
    expect(createTransaction).toHaveBeenCalledTimes(1);

    await expect(
      service.createEntry({
        ...input,
        amount: 99.99
      })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('returns created entry when post-write sync fails and replays on retry', async () => {
    const sync = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('post-write sync failed'));
    const session = makeSession({ sync });
    const createTransaction = vi.spyOn(session, 'createTransaction');
    const service = new EntryService(
      makeFactory(session),
      budgetService,
      new BudgetLockManager(),
      200,
      pino({ level: 'silent' }),
      60_000
    );

    const input = {
      budgetId: 'budget_abc',
      amount: 12.34,
      flow: 'expense' as const,
      date: '2026-02-08',
      payee: 'Coffee Shop',
      category: 'Dining',
      account: 'Checking',
      notes: 'Team meeting',
      idempotencyKey: 'idemp-post-sync'
    };

    const first = await service.createEntry(input);
    const second = await service.createEntry(input);

    expect(first.id).toBe('txn_created');
    expect(second.id).toBe('txn_created');
    expect(createTransaction).toHaveBeenCalledTimes(1);
  });
});
