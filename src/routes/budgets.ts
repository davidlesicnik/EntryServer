import type { FastifyPluginAsync, preHandlerHookHandler } from 'fastify';
import { budgetsResponseSchema } from '../schemas/budgets';

export interface BudgetsRouteOptions {
  apiKeyAuth: preHandlerHookHandler;
  budgetService: {
    listBudgets(): Promise<Array<{ id: string; name: string }>>;
  };
}

export const budgetsRoutes: FastifyPluginAsync<BudgetsRouteOptions> = async (app, options): Promise<void> => {
  app.get(
    '/budgets',
    {
      preHandler: options.apiKeyAuth
    },
    async () => {
      const budgets = await options.budgetService.listBudgets();
      return budgetsResponseSchema.parse(budgets);
    }
  );
};
