import Fastify, { type FastifyInstance, type preHandlerHookHandler } from 'fastify';
import type { Logger } from 'pino';
import type { AppConfig } from './config';
import { buildLogger } from './logger';
import { buildApiKeyAuth } from './auth/apiKeyAuth';
import { AppError, toErrorEnvelope } from './errors';
import type { ActualClientFactory } from './actual/clientFactory';
import { healthRoutes } from './routes/health';
import { budgetsRoutes } from './routes/budgets';
import { entriesRoutes } from './routes/entries';

export interface AppDependencies {
  logger?: Logger;
  apiKeyAuth?: preHandlerHookHandler;
  actualClientFactory: Pick<ActualClientFactory, 'ping'>;
  budgetService: {
    listBudgets(): Promise<Array<{ id: string; name: string }>>;
  };
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
      idempotencyKey?: string;
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

export function buildApp(config: AppConfig, dependencies: AppDependencies): FastifyInstance {
  const logger = dependencies.logger ?? buildLogger(config.logLevel);

  const app = Fastify({
    logger,
    bodyLimit: config.bodyLimitBytes,
    requestTimeout: config.requestTimeoutMs,
    disableRequestLogging: true
  });

  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('x-request-id', request.id);
    return payload;
  });

  app.addHook('onResponse', async (request, reply) => {
    const route = request.routeOptions.url ?? request.url;
    const params = (request.params ?? {}) as Record<string, string>;

    request.log.info(
      {
        route,
        statusCode: reply.statusCode,
        durationMs: reply.elapsedTime,
        budgetId: params.budgetId
      },
      'request_completed'
    );
  });

  app.setErrorHandler((error, request, reply) => {
    const { statusCode, payload } = toErrorEnvelope(error, request.id);
    const errorMetadata =
      error instanceof AppError
        ? { errorCode: error.code, errorName: error.name, errorMessage: error.message }
        : error instanceof Error
          ? { errorName: error.name, errorMessage: error.message }
          : { errorType: typeof error };
    request.log.error({ statusCode, ...errorMetadata }, 'request_failed');
    reply.status(statusCode).send(payload);
  });

  app.setNotFoundHandler((request, reply) => {
    const { payload } = toErrorEnvelope(new Error('Not found'), request.id);
    reply.status(404).send({
      error: {
        ...payload.error,
        code: 'not_found',
        message: 'Route not found'
      }
    });
  });

  const apiKeyAuth =
    dependencies.apiKeyAuth ??
    buildApiKeyAuth(config.bridgeApiKey, {
      failureWindowMs: config.authFailureWindowMs,
      maxAttemptsPerWindow: config.authMaxAttempts,
      blockDurationMs: config.authBlockMs
    });

  app.register(healthRoutes, {
    config,
    actualClientFactory: dependencies.actualClientFactory
  });
  app.register(budgetsRoutes, {
    apiKeyAuth,
    budgetService: dependencies.budgetService
  });
  app.register(entriesRoutes, {
    apiKeyAuth,
    entryService: dependencies.entryService
  });

  return app;
}
