import { describe, expect, it } from 'vitest';
import { BudgetLockManager } from '../src/actual/locks';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

describe('BudgetLockManager', () => {
  it('serializes writes for the same budget', async () => {
    const manager = new BudgetLockManager();
    const order: string[] = [];

    const first = manager.withBudgetLock('budget_abc', 500, async () => {
      order.push('first:start');
      await delay(50);
      order.push('first:end');
    });

    const second = manager.withBudgetLock('budget_abc', 500, async () => {
      order.push('second:start');
      await delay(10);
      order.push('second:end');
    });

    await Promise.all([first, second]);

    expect(order).toEqual(['first:start', 'first:end', 'second:start', 'second:end']);
  });

  it('throws conflict when lock wait times out', async () => {
    const manager = new BudgetLockManager();

    const blocker = manager.withBudgetLock('budget_abc', 500, async () => {
      await delay(80);
    });

    await expect(
      manager.withBudgetLock('budget_abc', 10, async () => {
        return;
      })
    ).rejects.toMatchObject({ statusCode: 409 });

    await blocker;
  });

  it('does not poison subsequent writes after a timed-out waiter', async () => {
    const manager = new BudgetLockManager();
    const order: string[] = [];

    const blocker = manager.withBudgetLock('budget_abc', 500, async () => {
      order.push('blocker:start');
      await delay(80);
      order.push('blocker:end');
    });

    await expect(
      manager.withBudgetLock('budget_abc', 10, async () => {
        order.push('timedout:start');
      })
    ).rejects.toMatchObject({ statusCode: 409 });

    await blocker;

    await manager.withBudgetLock('budget_abc', 500, async () => {
      order.push('after-timeout:start');
      await delay(5);
      order.push('after-timeout:end');
    });

    expect(order).toEqual(['blocker:start', 'blocker:end', 'after-timeout:start', 'after-timeout:end']);
  });
});
