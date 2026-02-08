import type { FastifyPluginAsync, preHandlerHookHandler } from 'fastify';
import {
  budgetIdParamsSchema,
  createEntryBodySchema,
  listEntriesQuerySchema,
  listEntriesResponseSchema,
  entryItemSchema
} from '../schemas/entries';

export interface EntriesRouteOptions {
  apiKeyAuth: preHandlerHookHandler;
  entryService: {
    listEntries(input: {
      budgetId: string;
      from: string;
      to: string;
      flow: 'all' | 'income' | 'expense';
      limit: number;
      offset: number;
    }): Promise<{
      items: Array<{
        id: string;
        budgetId: string;
        amount: number;
        flow: 'income' | 'expense';
        date: string;
        payee: string;
        category: string;
        account: string;
        notes?: string;
      }>;
      limit: number;
      offset: number;
      total: number;
    }>;
    createEntry(input: {
      budgetId: string;
      amount: number;
      flow: 'income' | 'expense';
      date: string;
      payee: string;
      category: string;
      account: string;
      notes?: string;
    }): Promise<{
      id: string;
      budgetId: string;
      amount: number;
      flow: 'income' | 'expense';
      date: string;
      payee: string;
      category: string;
      account: string;
      notes?: string;
    }>;
  };
}

export const entriesRoutes: FastifyPluginAsync<EntriesRouteOptions> = async (app, options): Promise<void> => {
  app.get(
    '/budgets/:budgetId/entries',
    {
      preHandler: options.apiKeyAuth
    },
    async (request) => {
      const params = budgetIdParamsSchema.parse(request.params);
      const query = listEntriesQuerySchema.parse(request.query);

      const result = await options.entryService.listEntries({
        budgetId: params.budgetId,
        ...query
      });

      return listEntriesResponseSchema.parse(result);
    }
  );

  app.post(
    '/budgets/:budgetId/entries',
    {
      preHandler: options.apiKeyAuth
    },
    async (request) => {
      const params = budgetIdParamsSchema.parse(request.params);
      const body = createEntryBodySchema.parse(request.body);

      const result = await options.entryService.createEntry({
        budgetId: params.budgetId,
        ...body
      });

      return entryItemSchema.parse(result);
    }
  );
};
