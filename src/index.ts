import { loadConfig } from './config';
import { buildLogger } from './logger';
import { buildApp } from './app';
import { DefaultActualClientFactory } from './actual/clientFactory';
import { BudgetService } from './actual/budgetService';
import { BudgetLockManager } from './actual/locks';
import { EntryService } from './actual/entryService';

async function start(): Promise<void> {
  const config = loadConfig();
  const logger = buildLogger(config.logLevel);

  const actualClientFactory = new DefaultActualClientFactory(config, logger);
  const budgetService = new BudgetService(config, actualClientFactory);
  const lockManager = new BudgetLockManager();
  const entryService = new EntryService(
    actualClientFactory,
    budgetService,
    lockManager,
    config.lockTimeoutMs,
    logger,
    config.idempotencyTtlMs,
    config.idempotencyMaxRecords
  );

  const app = buildApp(config, {
    logger,
    actualClientFactory,
    budgetService,
    entryService
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutdown_requested');
    await app.close();
    await actualClientFactory.shutdown();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  await app.listen({
    host: '0.0.0.0',
    port: config.port
  });

  logger.info({ port: config.port }, 'entryserver_started');
}

start().catch((error) => {
  // Startup errors happen before logger and app are guaranteed.
  console.error(error);
  process.exit(1);
});
