import { z } from 'zod';

export const budgetItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1)
});

export const budgetsResponseSchema = z.array(budgetItemSchema);
