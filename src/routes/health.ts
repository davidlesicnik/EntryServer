import type { FastifyPluginAsync } from 'fastify';
import type { AppConfig } from '../config';

export interface HealthRouteOptions {
  config: AppConfig;
  actualClientFactory: {
    ping(): Promise<void>;
  };
}

interface HealthPayload {
  status: 'ok' | 'degraded';
  actualConnectivity: 'ok' | 'error';
  budgetDiscoveryMode: AppConfig['budgetDiscoveryMode'];
}

export const healthRoutes: FastifyPluginAsync<HealthRouteOptions> = async (app, options): Promise<void> => {
  const resolveHealth = async (): Promise<HealthPayload> => {
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
  };

  app.get('/health', async () => {
    return resolveHealth();
  });

  app.get('/ready', async (_request, reply) => {
    const health = await resolveHealth();
    if (health.actualConnectivity === 'error') {
      reply.status(503);
    }
    return health;
  });
};
