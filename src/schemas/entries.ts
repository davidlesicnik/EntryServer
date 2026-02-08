import { z } from 'zod';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;
const MAX_QUERY_WINDOW_DAYS = 366;
const MAX_NAME_LENGTH = 200;
const MAX_NOTES_LENGTH = 2000;
const IDEMPOTENCY_KEY_REGEX = /^[A-Za-z0-9._:-]+$/;

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
}).superRefine((input, context) => {
  const fromMs = Date.parse(`${input.from}T00:00:00.000Z`);
  const toMs = Date.parse(`${input.to}T00:00:00.000Z`);

  if (fromMs > toMs) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['from'],
      message: 'from must be less than or equal to to'
    });
    return;
  }

  const spanDays = Math.floor((toMs - fromMs) / DAY_IN_MILLISECONDS) + 1;
  if (spanDays > MAX_QUERY_WINDOW_DAYS) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['to'],
      message: `Date range must be ${MAX_QUERY_WINDOW_DAYS} days or fewer`
    });
  }
});

export const budgetIdParamsSchema = z.object({
  budgetId: z.string().min(1)
});

export const createEntryBodySchema = z.object({
  amount: z.number().positive(),
  flow: flowSchema,
  date: dateSchema,
  payee: z.string().trim().min(1).max(MAX_NAME_LENGTH),
  category: z.string().trim().min(1).max(MAX_NAME_LENGTH),
  account: z.string().trim().min(1).max(MAX_NAME_LENGTH),
  notes: z.string().trim().max(MAX_NOTES_LENGTH).optional().default('')
});

export const idempotencyKeySchema = z.string().trim().min(1).max(128).regex(IDEMPOTENCY_KEY_REGEX);
export const idempotencyKeyHeaderSchema = z
  .union([idempotencyKeySchema, z.array(idempotencyKeySchema).length(1)])
  .optional()
  .transform((value) => (Array.isArray(value) ? value[0] : value));

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
