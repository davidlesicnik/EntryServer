import { z } from 'zod';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function isValidIsoDate(input: string): boolean {
  if (!DATE_REGEX.test(input)) {
    return false;
  }

  const date = new Date(`${input}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === input;
}

export const dateSchema = z.string().refine(isValidIsoDate, 'Date must be YYYY-MM-DD');

export const flowSchema = z.enum(['income', 'expense']);
export const listFlowSchema = z.enum(['all', 'income', 'expense']);

export const listEntriesQuerySchema = z.object({
  from: dateSchema,
  to: dateSchema,
  flow: listFlowSchema.default('all'),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0)
});

export const budgetIdParamsSchema = z.object({
  budgetId: z.string().min(1)
});

export const createEntryBodySchema = z.object({
  amount: z.number().positive(),
  flow: flowSchema,
  date: dateSchema,
  payee: z.string().min(1),
  category: z.string().min(1),
  account: z.string().min(1),
  notes: z.string().optional().default('')
});

export const entryItemSchema = z.object({
  id: z.string(),
  budgetId: z.string(),
  amount: z.number().positive(),
  flow: flowSchema,
  date: dateSchema,
  payee: z.string().min(1),
  category: z.string().min(1),
  account: z.string().min(1),
  notes: z.string().optional()
});

export const listEntriesResponseSchema = z.object({
  items: z.array(entryItemSchema),
  limit: z.number().int().min(1),
  offset: z.number().int().min(0),
  total: z.number().int().min(0)
});

export type Flow = z.infer<typeof flowSchema>;
export type ListFlow = z.infer<typeof listFlowSchema>;
export type CreateEntryBody = z.infer<typeof createEntryBodySchema>;

export function toMinorUnits(amount: number): number {
  return Math.round(amount * 100);
}

export function fromMinorUnits(amount: number): number {
  return Number((Math.abs(amount) / 100).toFixed(2));
}

export function toActualSignedAmount(amount: number, flow: Flow): number {
  const minor = toMinorUnits(amount);
  return flow === 'expense' ? -Math.abs(minor) : Math.abs(minor);
}

export function fromActualSignedAmount(actualAmount: number): { amount: number; flow: Flow } {
  return {
    amount: fromMinorUnits(actualAmount),
    flow: actualAmount < 0 ? 'expense' : 'income'
  };
}
