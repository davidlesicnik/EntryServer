import type { FastifyPluginAsync } from 'fastify';
import type { AppConfig } from '../config';

export interface HealthRouteOptions {
  config: AppConfig;
  actualClientFactory: {
    ping(): Promise<void>;
  };
}

export const healthRoutes: FastifyPluginAsync<HealthRouteOptions> = async (app, options): Promise<void> => {
  app.get('/health', async () => {
    let actualConnectivity: 'ok' | 'error' = 'ok';

    try {
      await options.actualClientFactory.ping();
    } catch {
      actualConnectivity = 'error';
    }

    return {
      status: actualConnectivity === 'ok' ? 'ok' : 'degraded',
      actualConnectivity,
      budgetDiscoveryMode: options.config.budgetDiscoveryMode
    };
  });
};
