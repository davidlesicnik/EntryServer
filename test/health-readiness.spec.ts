import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app';
import { makeConfig } from './helpers';

describe('health and readiness routes', () => {
  it('keeps /health as 200 when Actual connectivity is degraded', async () => {
    const config = makeConfig();
    const app = buildApp(config, {
      actualClientFactory: {
        ping: vi.fn().mockRejectedValue(new Error('down'))
      },
      budgetService: {
        listBudgets: vi.fn().mockResolvedValue([])
      },
      entryService: {
        listEntries: vi.fn(),
        createEntry: vi.fn()
      }
    });

    const response = await request(app.server).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('degraded');
    expect(response.body.actualConnectivity).toBe('error');

    await app.close();
  });

  it('returns 503 on /ready when Actual connectivity is degraded', async () => {
    const config = makeConfig();
    const app = buildApp(config, {
      actualClientFactory: {
        ping: vi.fn().mockRejectedValue(new Error('down'))
      },
      budgetService: {
        listBudgets: vi.fn().mockResolvedValue([])
      },
      entryService: {
        listEntries: vi.fn(),
        createEntry: vi.fn()
      }
    });

    const response = await request(app.server).get('/ready');

    expect(response.status).toBe(503);
    expect(response.body.status).toBe('degraded');
    expect(response.body.actualConnectivity).toBe('error');

    await app.close();
  });

  it('returns 200 on /ready when Actual connectivity is healthy', async () => {
    const config = makeConfig();
    const app = buildApp(config, {
      actualClientFactory: {
        ping: vi.fn().mockResolvedValue(undefined)
      },
      budgetService: {
        listBudgets: vi.fn().mockResolvedValue([])
      },
      entryService: {
        listEntries: vi.fn(),
        createEntry: vi.fn()
      }
    });

    const response = await request(app.server).get('/ready');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.actualConnectivity).toBe('ok');

    await app.close();
  });
});
