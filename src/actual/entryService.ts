import type { Logger } from 'pino';
import { ConflictError, NotFoundError } from '../errors';
import {
  fromActualSignedAmount,
  toActualSignedAmount,
  type CreateEntryBody,
  type Flow,
  type ListFlow
} from '../schemas/entries';
import type { ActualClientFactory, NamedEntity } from './clientFactory';
import type { BudgetLockManager } from './locks';

export interface EntryResponseItem {
  id: string;
  budgetId: string;
  amount: number;
  flow: Flow;
  date: string;
  payee: string;
  category: string;
  account: string;
  notes?: string;
}

export interface ListEntriesInput {
  budgetId: string;
  from: string;
  to: string;
  flow: ListFlow;
  limit: number;
  offset: number;
}

export interface ListEntriesResult {
  items: EntryResponseItem[];
  limit: number;
  offset: number;
  total: number;
}

export interface CreateEntryInput extends CreateEntryBody {
  budgetId: string;
  idempotencyKey?: string;
}

interface IdempotencyRecord {
  fingerprint: string;
  response: EntryResponseItem;
  createdAt: number;
}

function mapById(items: NamedEntity[]): Map<string, string> {
  return new Map(items.map((item) => [item.id, item.name]));
}

function findByName(items: NamedEntity[], name: string): NamedEntity | undefined {
  return items.find((item) => item.name === name);
}

export class EntryService {
  private readonly idempotencyRecords = new Map<string, Map<string, IdempotencyRecord>>();
  private idempotencyRecordCount = 0;

  constructor(
    private readonly actualClientFactory: ActualClientFactory,
    private readonly budgetService: {
      assertBudgetAccessible(budgetId: string): Promise<void>;
    },
    private readonly lockManager: BudgetLockManager,
    private readonly lockTimeoutMs: number,
    private readonly logger: Logger,
    private readonly idempotencyTtlMs: number = 24 * 60 * 60 * 1000,
    private readonly idempotencyMaxRecords: number = 10_000
  ) {}

  private fingerprintCreateInput(input: CreateEntryInput): string {
    return JSON.stringify({
      amount: input.amount,
      flow: input.flow,
      date: input.date,
      payee: input.payee,
      category: input.category,
      account: input.account,
      notes: input.notes ?? ''
    });
  }

  private deleteRecord(budgetId: string, key: string): void {
    const budgetRecords = this.idempotencyRecords.get(budgetId);
    if (!budgetRecords) {
      return;
    }

    if (budgetRecords.delete(key)) {
      this.idempotencyRecordCount = Math.max(0, this.idempotencyRecordCount - 1);
    }

    if (budgetRecords.size === 0) {
      this.idempotencyRecords.delete(budgetId);
    }
  }

  private pruneExpiredIdempotencyRecords(now: number): void {
    for (const [budgetId, budgetRecords] of this.idempotencyRecords.entries()) {
      for (const [key, record] of budgetRecords.entries()) {
        if (now - record.createdAt > this.idempotencyTtlMs) {
          this.deleteRecord(budgetId, key);
        }
      }
    }
  }

  private evictOldestIdempotencyRecord(): boolean {
    let oldestBudgetId: string | null = null;
    let oldestKey: string | null = null;
    let oldestCreatedAt = Number.POSITIVE_INFINITY;

    for (const [budgetId, budgetRecords] of this.idempotencyRecords.entries()) {
      for (const [key, record] of budgetRecords.entries()) {
        if (record.createdAt < oldestCreatedAt) {
          oldestCreatedAt = record.createdAt;
          oldestBudgetId = budgetId;
          oldestKey = key;
        }
      }
    }

    if (!oldestBudgetId || !oldestKey) {
      return false;
    }

    this.deleteRecord(oldestBudgetId, oldestKey);
    return true;
  }

  private getStoredIdempotentResponse(
    budgetId: string,
    idempotencyKey: string,
    fingerprint: string,
    now: number
  ): EntryResponseItem | null {
    this.pruneExpiredIdempotencyRecords(now);

    const budgetRecords = this.idempotencyRecords.get(budgetId);
    const existing = budgetRecords?.get(idempotencyKey);
    if (!existing) {
      return null;
    }

    if (existing.fingerprint !== fingerprint) {
      throw new ConflictError('Idempotency-Key was already used with a different request payload');
    }

    return existing.response;
  }

  private storeIdempotentResponse(
    budgetId: string,
    idempotencyKey: string,
    fingerprint: string,
    response: EntryResponseItem,
    now: number
  ): void {
    const budgetRecords = this.idempotencyRecords.get(budgetId) ?? new Map<string, IdempotencyRecord>();
    const isNewRecord = !budgetRecords.has(idempotencyKey);

    if (isNewRecord) {
      this.pruneExpiredIdempotencyRecords(now);
      while (this.idempotencyRecordCount >= this.idempotencyMaxRecords) {
        const evicted = this.evictOldestIdempotencyRecord();
        if (!evicted) {
          break;
        }
      }
    }

    budgetRecords.set(idempotencyKey, {
      fingerprint,
      response,
      createdAt: now
    });
    this.idempotencyRecords.set(budgetId, budgetRecords);
    if (isNewRecord) {
      this.idempotencyRecordCount += 1;
    }
  }

  async listEntries(input: ListEntriesInput): Promise<ListEntriesResult> {
    await this.budgetService.assertBudgetAccessible(input.budgetId);

    return this.actualClientFactory.withBudget(input.budgetId, async (session) => {
      await session.sync();

      const [accounts, categories, payees, transactions] = await Promise.all([
        session.getAccounts(),
        session.getCategories(),
        session.getPayees(),
        session.listTransactions({ from: input.from, to: input.to })
      ]);

      const accountById = mapById(accounts);
      const categoryById = mapById(categories);
      const payeeById = mapById(payees);

      const filtered = transactions
        .filter((transaction) => {
          if (transaction.date < input.from || transaction.date > input.to) {
            return false;
          }

          if (input.flow === 'all') {
            return true;
          }

          if (input.flow === 'expense') {
            return transaction.amount < 0;
          }

          return transaction.amount >= 0;
        })
        .sort((a, b) => {
          if (a.date === b.date) {
            return a.id.localeCompare(b.id);
          }
          return a.date.localeCompare(b.date);
        });

      const total = filtered.length;
      const paginated = filtered.slice(input.offset, input.offset + input.limit);

      const items: EntryResponseItem[] = paginated.map((transaction) => {
        const amountAndFlow = fromActualSignedAmount(transaction.amount);
        return {
          id: transaction.id,
          budgetId: input.budgetId,
          amount: amountAndFlow.amount,
          flow: amountAndFlow.flow,
          date: transaction.date,
          payee: transaction.payeeId ? payeeById.get(transaction.payeeId) ?? 'Unknown' : 'Unknown',
          category: transaction.categoryId ? categoryById.get(transaction.categoryId) ?? 'Unknown' : 'Unknown',
          account: accountById.get(transaction.accountId) ?? 'Unknown',
          notes: transaction.notes
        };
      });

      return {
        items,
        limit: input.limit,
        offset: input.offset,
        total
      };
    });
  }

  async createEntry(input: CreateEntryInput): Promise<EntryResponseItem> {
    await this.budgetService.assertBudgetAccessible(input.budgetId);

    return this.lockManager.withBudgetLock(input.budgetId, this.lockTimeoutMs, async () => {
      const now = Date.now();
      const fingerprint = input.idempotencyKey ? this.fingerprintCreateInput(input) : undefined;
      if (input.idempotencyKey && fingerprint) {
        const existing = this.getStoredIdempotentResponse(input.budgetId, input.idempotencyKey, fingerprint, now);
        if (existing) {
          return existing;
        }
      }

      return this.actualClientFactory.withBudget(input.budgetId, async (session) => {
        await session.sync();

        const [accounts, categories, payees] = await Promise.all([
          session.getAccounts(),
          session.getCategories(),
          session.getPayees()
        ]);

        const account = findByName(accounts, input.account);
        if (!account) {
          throw new NotFoundError(`Account not found: ${input.account}`);
        }

        const category = findByName(categories, input.category);
        if (!category) {
          throw new NotFoundError(`Category not found: ${input.category}`);
        }

        let payee = findByName(payees, input.payee);
        if (!payee) {
          payee = await session.createPayee(input.payee);
        }

        const actualAmount = toActualSignedAmount(input.amount, input.flow);

        this.logger.debug(
          {
            budgetId: input.budgetId,
            accountId: account.id,
            categoryId: category.id,
            payeeId: payee.id,
            amount: actualAmount
          },
          'Creating entry in Actual'
        );

        const created = await session.createTransaction({
          accountId: account.id,
          categoryId: category.id,
          payeeId: payee.id,
          date: input.date,
          amount: actualAmount,
          notes: input.notes
        });

        try {
          await session.sync();
        } catch (error) {
          this.logger.warn(
            {
              budgetId: input.budgetId,
              transactionId: created.id,
              idempotencyKey: input.idempotencyKey,
              errorName: error instanceof Error ? error.name : typeof error,
              errorMessage: error instanceof Error ? error.message : String(error)
            },
            'Post-write sync failed; returning created transaction id'
          );
        }

        const response: EntryResponseItem = {
          id: created.id,
          budgetId: input.budgetId,
          amount: input.amount,
          flow: input.flow,
          date: input.date,
          payee: payee.name,
          category: category.name,
          account: account.name,
          notes: input.notes
        };

        if (input.idempotencyKey && fingerprint) {
          this.storeIdempotentResponse(input.budgetId, input.idempotencyKey, fingerprint, response, now);
        }

        return response;
      });
    });
  }
}
