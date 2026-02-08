import { ConflictError } from '../errors';

interface LockEntry {
  tail: Promise<void>;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new ConflictError('Write lock timeout for budget'));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  });
}

export class BudgetLockManager {
  private readonly locks = new Map<string, LockEntry>();

  async withBudgetLock<T>(budgetId: string, timeoutMs: number, fn: () => Promise<T>): Promise<T> {
    const existing = this.locks.get(budgetId) ?? { tail: Promise.resolve() };
    const waitFor = existing.tail;

    let release!: () => void;
    const currentTail = new Promise<void>((resolve) => {
      release = resolve;
    });

    const chainedTail = waitFor.finally(() => currentTail);
    existing.tail = chainedTail;
    this.locks.set(budgetId, existing);

    await withTimeout(waitFor, timeoutMs);

    try {
      return await fn();
    } finally {
      release();
      if (this.locks.get(budgetId)?.tail === chainedTail) {
        this.locks.delete(budgetId);
      }
    }
  }
}
