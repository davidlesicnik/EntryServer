import type { FastifyPluginAsync, preHandlerHookHandler } from 'fastify';
import { budgetsResponseSchema } from '../schemas/budgets';

export interface BudgetsRouteOptions {
  apiKeyAuth: preHandlerHookHandler;
  requestRateLimit?: preHandlerHookHandler;
  budgetService: {
    listBudgets(): Promise<Array<{ id: string; name: string }>>;
  };
}

export const budgetsRoutes: FastifyPluginAsync<BudgetsRouteOptions> = async (app, options): Promise<void> => {
  const preHandler = options.requestRateLimit ? [options.apiKeyAuth, options.requestRateLimit] : options.apiKeyAuth;

  app.get(
    '/budgets',
    {
      preHandler
    },
    async () => {
      const budgets = await options.budgetService.listBudgets();
      return budgetsResponseSchema.parse(budgets);
    }
  );
};
