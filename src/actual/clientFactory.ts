import * as actualApi from '@actual-app/api';
import type { Logger } from 'pino';
import type { AppConfig } from '../config';
import { UpstreamError } from '../errors';

export interface BudgetSummary {
  id: string;
  name: string;
}

export interface NamedEntity {
  id: string;
  name: string;
}

export interface ActualTransaction {
  id: string;
  date: string;
  amount: number;
  accountId: string;
  categoryId?: string;
  payeeId?: string;
  notes?: string;
}

export interface ActualTransactionCreate {
  accountId: string;
  categoryId: string;
  payeeId?: string;
  date: string;
  amount: number;
  notes?: string;
}

export interface ActualBudgetSession {
  sync(): Promise<void>;
  getAccounts(): Promise<NamedEntity[]>;
  getCategories(): Promise<NamedEntity[]>;
  getPayees(): Promise<NamedEntity[]>;
  createPayee(name: string): Promise<NamedEntity>;
  listTransactions(params: { from: string; to: string }): Promise<ActualTransaction[]>;
  createTransaction(input: ActualTransactionCreate): Promise<{ id: string }>;
  close(): Promise<void>;
}

export interface ActualClientFactory {
  listBudgets(): Promise<BudgetSummary[]>;
  withBudget<T>(budgetId: string, fn: (session: ActualBudgetSession) => Promise<T>): Promise<T>;
  ping(): Promise<void>;
  shutdown(): Promise<void>;
}

type UnknownRecord = Record<string, unknown>;

type ActualApiLike = UnknownRecord & {
  init?: (...args: unknown[]) => Promise<unknown>;
  shutdown?: () => Promise<unknown>;
  login?: (...args: unknown[]) => Promise<unknown>;
  sync?: () => Promise<unknown>;
  closeBudget?: () => Promise<unknown>;
  listUserFiles?: () => Promise<unknown>;
  listBudgets?: () => Promise<unknown>;
  getBudgets?: () => Promise<unknown>;
  downloadBudget?: (...args: unknown[]) => Promise<unknown>;
  openBudget?: (...args: unknown[]) => Promise<unknown>;
  loadBudget?: (...args: unknown[]) => Promise<unknown>;
  getAccounts?: () => Promise<unknown>;
  getCategories?: () => Promise<unknown>;
  getPayees?: () => Promise<unknown>;
  createPayee?: (...args: unknown[]) => Promise<unknown>;
  addPayee?: (...args: unknown[]) => Promise<unknown>;
  getTransactions?: (...args: unknown[]) => Promise<unknown>;
  addTransaction?: (...args: unknown[]) => Promise<unknown>;
  addTransactions?: (...args: unknown[]) => Promise<unknown>;
  createTransaction?: (...args: unknown[]) => Promise<unknown>;
};

function sanitizeErrorForLog(error: unknown): Record<string, string> {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message
    };
  }
  return {
    errorType: typeof error
  };
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function toStringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function normalizeEntity(item: unknown): NamedEntity | null {
  if (!item || typeof item !== 'object') {
    return null;
  }

  const record = item as UnknownRecord;
  const id =
    toStringValue(record.id) ??
    toStringValue(record.uuid) ??
    toStringValue(record.account) ??
    toStringValue(record.category) ??
    toStringValue(record.payee);
  const name = toStringValue(record.name);

  if (!id || !name) {
    return null;
  }

  return { id, name };
}

function normalizeBudget(item: unknown): BudgetSummary | null {
  if (!item || typeof item !== 'object') {
    return null;
  }

  const record = item as UnknownRecord;
  const id =
    toStringValue(record.id) ?? toStringValue(record.fileId) ?? toStringValue(record.groupId) ?? toStringValue(record.uuid);
  const name = toStringValue(record.name) ?? toStringValue(record.fileName) ?? toStringValue(record.groupName) ?? id;

  if (!id || !name) {
    return null;
  }

  return { id, name };
}

function normalizeTransaction(item: unknown, fallbackAccountId: string): ActualTransaction | null {
  if (!item || typeof item !== 'object') {
    return null;
  }

  const record = item as UnknownRecord;
  const id = toStringValue(record.id) ?? toStringValue(record.uuid);
  const date = toStringValue(record.date);
  const accountId = toStringValue(record.account) ?? toStringValue(record.accountId) ?? fallbackAccountId;
  const categoryId = toStringValue(record.category) ?? toStringValue(record.categoryId);
  const payeeId = toStringValue(record.payee) ?? toStringValue(record.payeeId);
  const notes = toStringValue(record.notes) ?? toStringValue(record.note);

  const amountRaw = record.amount;
  const amount = typeof amountRaw === 'number' ? amountRaw : Number(amountRaw);

  if (!id || !date || !accountId || Number.isNaN(amount)) {
    return null;
  }

  return {
    id,
    date,
    amount,
    accountId,
    categoryId,
    payeeId,
    notes
  };
}

class ApiBudgetSession implements ActualBudgetSession {
  constructor(
    private readonly api: ActualApiLike,
    private readonly logger: Logger
  ) {}

  async sync(): Promise<void> {
    if (typeof this.api.sync !== 'function') {
      return;
    }

    try {
      await this.api.sync();
    } catch (error) {
      throw new UpstreamError('Failed to sync budget', error);
    }
  }

  async getAccounts(): Promise<NamedEntity[]> {
    if (typeof this.api.getAccounts !== 'function') {
      throw new UpstreamError('Actual API does not expose getAccounts');
    }

    const result = await this.api.getAccounts();
    return asArray(result).map(normalizeEntity).filter((item): item is NamedEntity => item !== null);
  }

  async getCategories(): Promise<NamedEntity[]> {
    if (typeof this.api.getCategories !== 'function') {
      throw new UpstreamError('Actual API does not expose getCategories');
    }

    const result = await this.api.getCategories();
    return asArray(result).map(normalizeEntity).filter((item): item is NamedEntity => item !== null);
  }

  async getPayees(): Promise<NamedEntity[]> {
    if (typeof this.api.getPayees !== 'function') {
      throw new UpstreamError('Actual API does not expose getPayees');
    }

    const result = await this.api.getPayees();
    return asArray(result).map(normalizeEntity).filter((item): item is NamedEntity => item !== null);
  }

  async createPayee(name: string): Promise<NamedEntity> {
    try {
      if (typeof this.api.createPayee === 'function') {
        const created = await this.api.createPayee({ name });
        const normalized = normalizeEntity(created);
        if (normalized) {
          return normalized;
        }
      }

      if (typeof this.api.addPayee === 'function') {
        const created = await this.api.addPayee(name);
        const normalized = normalizeEntity(created);
        if (normalized) {
          return normalized;
        }
      }
    } catch (error) {
      throw new UpstreamError('Failed to create payee', error);
    }

    throw new UpstreamError('Actual API did not return payee data for created payee');
  }

  async listTransactions(params: { from: string; to: string }): Promise<ActualTransaction[]> {
    if (typeof this.api.getTransactions !== 'function') {
      throw new UpstreamError('Actual API does not expose getTransactions');
    }

    const accounts = await this.getAccounts();
    const all: ActualTransaction[] = [];

    for (const account of accounts) {
      try {
        const maybe = await this.api.getTransactions(account.id, params.from, params.to);
        const items = asArray(maybe)
          .map((item) => normalizeTransaction(item, account.id))
          .filter((item): item is ActualTransaction => item !== null);
        all.push(...items);
      } catch (error) {
        this.logger.debug(
          {
            accountId: account.id,
            ...sanitizeErrorForLog(error)
          },
          'Primary getTransactions signature failed, trying object signature'
        );
        const maybe = await this.api.getTransactions({ accountId: account.id, from: params.from, to: params.to });
        const items = asArray(maybe)
          .map((item) => normalizeTransaction(item, account.id))
          .filter((item): item is ActualTransaction => item !== null);
        all.push(...items);
      }
    }

    return all;
  }

  async createTransaction(input: ActualTransactionCreate): Promise<{ id: string }> {
    const payload = {
      date: input.date,
      amount: input.amount,
      payee: input.payeeId,
      category: input.categoryId,
      notes: input.notes
    };

    try {
      if (typeof this.api.addTransaction === 'function') {
        const created = await this.api.addTransaction(input.accountId, payload);
        const normalized = normalizeTransaction(created, input.accountId);
        if (normalized) {
          return { id: normalized.id };
        }
      }

      if (typeof this.api.addTransactions === 'function') {
        const created = await this.api.addTransactions(input.accountId, [payload]);
        const first = asArray(created)[0];
        const normalized = normalizeTransaction(first, input.accountId);
        if (normalized) {
          return { id: normalized.id };
        }
      }

      if (typeof this.api.createTransaction === 'function') {
        const created = await this.api.createTransaction({ ...payload, account: input.accountId });
        const normalized = normalizeTransaction(created, input.accountId);
        if (normalized) {
          return { id: normalized.id };
        }
      }
    } catch (error) {
      throw new UpstreamError('Failed to create transaction', error);
    }

    throw new UpstreamError('Actual API did not return transaction data for created transaction');
  }

  async close(): Promise<void> {
    if (typeof this.api.closeBudget !== 'function') {
      return;
    }

    try {
      await this.api.closeBudget();
    } catch (error) {
      this.logger.warn(sanitizeErrorForLog(error), 'Failed to close budget session cleanly');
    }
  }
}

export class DefaultActualClientFactory implements ActualClientFactory {
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private operationTail: Promise<void> = Promise.resolve();
  private readonly api: ActualApiLike;

  constructor(
    private readonly config: AppConfig,
    private readonly logger: Logger,
    apiOverride?: ActualApiLike
  ) {
    this.api = apiOverride ?? (actualApi as unknown as ActualApiLike);
  }

  private async withApiLock<T>(fn: () => Promise<T>): Promise<T> {
    const previous = this.operationTail;
    let release!: () => void;
    this.operationTail = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;

    try {
      return await fn();
    } finally {
      release();
    }
  }

  private async ensureInit(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    if (typeof this.api.init !== 'function') {
      throw new UpstreamError('Actual API init function is not available');
    }

    this.initPromise = (async () => {
      try {
        await this.api.init({
          dataDir: '/tmp/entryserver-actual-data',
          serverURL: this.config.actualServerUrl,
          password: this.config.actualPassword
        });

        if (typeof this.api.login === 'function') {
          await this.api.login(this.config.actualPassword);
        }

        this.initialized = true;
      } catch (error) {
        throw new UpstreamError('Failed to initialize Actual API client', error);
      } finally {
        this.initPromise = null;
      }
    })();

    await this.initPromise;
  }

  async listBudgets(): Promise<BudgetSummary[]> {
    return this.withApiLock(async () => {
      await this.ensureInit();

      const tryMethods: Array<() => Promise<unknown>> = [];

      if (typeof this.api.listUserFiles === 'function') {
        tryMethods.push(() => this.api.listUserFiles!());
      }
      if (typeof this.api.listBudgets === 'function') {
        tryMethods.push(() => this.api.listBudgets!());
      }
      if (typeof this.api.getBudgets === 'function') {
        tryMethods.push(() => this.api.getBudgets!());
      }

      for (const call of tryMethods) {
        try {
          const result = await call();
          const normalized = asArray(result)
            .map(normalizeBudget)
            .filter((item): item is BudgetSummary => item !== null);
          if (normalized.length > 0) {
            return normalized;
          }
        } catch (error) {
          this.logger.debug(sanitizeErrorForLog(error), 'Budget listing method failed, trying next fallback');
        }
      }

      return [];
    });
  }

  private async openBudget(budgetId: string): Promise<void> {
    const filePassword = this.config.actualFilePassword;

    const attempts: Array<() => Promise<unknown>> = [];
    if (typeof this.api.downloadBudget === 'function') {
      attempts.push(async () => {
        if (filePassword) {
          return this.api.downloadBudget!(budgetId, { password: filePassword });
        }
        return this.api.downloadBudget!(budgetId);
      });
      if (filePassword) {
        attempts.push(() => this.api.downloadBudget!(budgetId, filePassword));
      }
    }
    if (typeof this.api.openBudget === 'function') {
      attempts.push(() => this.api.openBudget!(budgetId));
    }
    if (typeof this.api.loadBudget === 'function') {
      attempts.push(() => this.api.loadBudget!(budgetId));
    }

    if (attempts.length === 0) {
      throw new UpstreamError('Actual API does not expose a budget open method');
    }

    let lastError: unknown = undefined;
    for (const attempt of attempts) {
      try {
        await attempt();
        return;
      } catch (error) {
        lastError = error;
      }
    }

    throw new UpstreamError(`Failed to open budget ${budgetId}`, lastError);
  }

  async withBudget<T>(budgetId: string, fn: (session: ActualBudgetSession) => Promise<T>): Promise<T> {
    return this.withApiLock(async () => {
      await this.ensureInit();
      await this.openBudget(budgetId);
      const session = new ApiBudgetSession(this.api, this.logger);

      try {
        return await fn(session);
      } finally {
        await session.close();
      }
    });
  }

  async ping(): Promise<void> {
    await this.listBudgets();
  }

  async shutdown(): Promise<void> {
    await this.withApiLock(async () => {
      if (!this.initialized) {
        return;
      }

      if (typeof this.api.shutdown === 'function') {
        try {
          await this.api.shutdown();
        } catch (error) {
          this.logger.warn(sanitizeErrorForLog(error), 'Failed to shutdown Actual API cleanly');
        }
      }

      this.initialized = false;
    });
  }
}
