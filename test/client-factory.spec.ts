import { describe, expect, it } from 'vitest';
import pino from 'pino';
import { DefaultActualClientFactory } from '../src/actual/clientFactory';
import { makeConfig } from './helpers';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

describe('DefaultActualClientFactory', () => {
  it('serializes withBudget operations to avoid shared client session races', async () => {
    const events: string[] = [];

    const api = {
      init: async () => {
        events.push('init');
      },
      login: async () => {
        events.push('login');
      },
      openBudget: async (budgetId: string) => {
        events.push(`open:${budgetId}`);
      },
      closeBudget: async () => {
        events.push('close');
      }
    };

    const factory = new DefaultActualClientFactory(makeConfig(), pino({ level: 'silent' }), api);

    const first = factory.withBudget('budget_a', async () => {
      events.push('run:budget_a:start');
      await delay(30);
      events.push('run:budget_a:end');
      return 'a';
    });

    const second = factory.withBudget('budget_b', async () => {
      events.push('run:budget_b:start');
      events.push('run:budget_b:end');
      return 'b';
    });

    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult).toBe('a');
    expect(secondResult).toBe('b');
    expect(events).toEqual([
      'init',
      'login',
      'open:budget_a',
      'run:budget_a:start',
      'run:budget_a:end',
      'close',
      'open:budget_b',
      'run:budget_b:start',
      'run:budget_b:end',
      'close'
    ]);
  });
});
