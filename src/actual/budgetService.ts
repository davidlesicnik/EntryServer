import type { AppConfig, BudgetConfigItem } from '../config';
import { NotFoundError, UpstreamError } from '../errors';
import type { ActualClientFactory, BudgetSummary } from './clientFactory';

export class BudgetService {
  constructor(
    private readonly config: AppConfig,
    private readonly actualClientFactory: ActualClientFactory
  ) {}

  private configuredBudgets(): BudgetSummary[] {
    return this.config.configuredBudgets.map((item: BudgetConfigItem) => ({
      id: item.id,
      name: item.name
    }));
  }

  async listBudgets(): Promise<BudgetSummary[]> {
    if (this.config.budgetDiscoveryMode === 'configured') {
      return this.configuredBudgets();
    }

    try {
      const autoBudgets = await this.actualClientFactory.listBudgets();
      if (autoBudgets.length > 0) {
        return autoBudgets;
      }

      return this.configuredBudgets();
    } catch (error) {
      const fallback = this.configuredBudgets();
      if (fallback.length > 0) {
        return fallback;
      }

      throw new UpstreamError('Failed to discover budgets from Actual', error);
    }
  }

  async assertBudgetAccessible(budgetId: string): Promise<void> {
    const budgets = await this.listBudgets();
    const found = budgets.some((budget) => budget.id === budgetId);
    if (!found) {
      throw new NotFoundError(`Budget not found: ${budgetId}`);
    }
  }
}
