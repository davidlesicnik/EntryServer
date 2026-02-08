import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import { TooManyRequestsError } from '../errors';
import { resolveClientIdentifier } from './clientIdentity';

interface RateLimitState {
  count: number;
  windowStartedAt: number;
  lastSeenAt: number;
}

export interface RequestRateLimitOptions {
  windowMs: number;
  maxRequests: number;
  stateTtlMs?: number;
  maxTrackedClients?: number;
  now?: () => number;
}

const DEFAULT_STATE_TTL_MS = 300_000;
const DEFAULT_MAX_TRACKED_CLIENTS = 10_000;

function pruneRateLimitState(
  stateByClient: Map<string, RateLimitState>,
  now: number,
  stateTtlMs: number,
  maxTrackedClients: number
): void {
  for (const [clientId, state] of stateByClient.entries()) {
    if (now - state.lastSeenAt > stateTtlMs) {
      stateByClient.delete(clientId);
    }
  }

  if (stateByClient.size <= maxTrackedClients) {
    return;
  }

  const entriesByAge = [...stateByClient.entries()].sort((a, b) => a[1].lastSeenAt - b[1].lastSeenAt);
  const overflowCount = stateByClient.size - maxTrackedClients;
  for (let index = 0; index < overflowCount; index += 1) {
    const entry = entriesByAge[index];
    if (entry) {
      stateByClient.delete(entry[0]);
    }
  }
}

export function buildRequestRateLimit(options: RequestRateLimitOptions): preHandlerHookHandler {
  const windowMs = options.windowMs;
  const maxRequests = options.maxRequests;
  const stateTtlMs = options.stateTtlMs ?? DEFAULT_STATE_TTL_MS;
  const maxTrackedClients = options.maxTrackedClients ?? DEFAULT_MAX_TRACKED_CLIENTS;
  const now = options.now ?? Date.now;
  const stateByClient = new Map<string, RateLimitState>();

  return async function requestRateLimit(_request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const nowTs = now();
    pruneRateLimitState(stateByClient, nowTs, stateTtlMs, maxTrackedClients);

    const clientId = resolveClientIdentifier(_request);
    const existing = stateByClient.get(clientId);

    const state: RateLimitState =
      existing ??
      ({
        count: 0,
        windowStartedAt: nowTs,
        lastSeenAt: nowTs
      } satisfies RateLimitState);

    if (nowTs - state.windowStartedAt >= windowMs) {
      state.count = 0;
      state.windowStartedAt = nowTs;
    }

    if (state.count >= maxRequests) {
      const retryAfterMs = Math.max(0, windowMs - (nowTs - state.windowStartedAt));
      throw new TooManyRequestsError('Rate limit exceeded', { retryAfterMs });
    }

    state.count += 1;
    state.lastSeenAt = nowTs;
    stateByClient.set(clientId, state);
  };
}
