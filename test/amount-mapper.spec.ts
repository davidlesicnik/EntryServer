import { describe, expect, it } from 'vitest';
import { fromActualSignedAmount, toActualSignedAmount } from '../src/schemas/entries';

describe('amount sign mapper', () => {
  it('maps expense API amount to negative Actual amount', () => {
    expect(toActualSignedAmount(12.34, 'expense')).toBe(-1234);
  });

  it('maps income API amount to positive Actual amount', () => {
    expect(toActualSignedAmount(12.34, 'income')).toBe(1234);
  });

  it('maps Actual signed amount back to API DTO', () => {
    expect(fromActualSignedAmount(-1234)).toEqual({ amount: 12.34, flow: 'expense' });
    expect(fromActualSignedAmount(1234)).toEqual({ amount: 12.34, flow: 'income' });
  });
});
