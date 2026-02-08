import { timingSafeEqual } from 'node:crypto';
import { type FastifyReply, type FastifyRequest, type preHandlerHookHandler } from 'fastify';
import { TooManyRequestsError, UnauthorizedError } from '../errors';
import { resolveClientIdentifier } from './clientIdentity';

interface AuthFailureState {
  attempts: number;
  windowStartedAt: number;
  blockedUntil: number;
  lastSeenAt: number;
}

export interface ApiKeyAuthOptions {
  failureWindowMs?: number;
  maxAttemptsPerWindow?: number;
  blockDurationMs?: number;
  stateTtlMs?: number;
  maxTrackedClients?: number;
  now?: () => number;
}

const DEFAULT_FAILURE_WINDOW_MS = 60_000;
const DEFAULT_MAX_ATTEMPTS_PER_WINDOW = 10;
const DEFAULT_BLOCK_DURATION_MS = 300_000;
const DEFAULT_STATE_TTL_MS = 900_000;
const DEFAULT_MAX_TRACKED_CLIENTS = 10_000;
const BEARER_HEADER_PATTERN = /^\s*Bearer\s+(\S+)\s*$/i;

function extractBearerToken(authorization: string): string | null {
  const match = authorization.match(BEARER_HEADER_PATTERN);
  return match?.[1] ?? null;
}

function compareApiKey(actualToken: string, expectedApiKey: string): boolean {
  const expectedBuffer = Buffer.from(expectedApiKey, 'utf8');
  const actualBuffer = Buffer.from(actualToken, 'utf8');
  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }
  return timingSafeEqual(expectedBuffer, actualBuffer);
}

function pruneFailures(
  failuresByClient: Map<string, AuthFailureState>,
  now: number,
  stateTtlMs: number,
  maxTrackedClients: number
): void {
  for (const [clientId, state] of failuresByClient.entries()) {
    if (now - state.lastSeenAt > stateTtlMs && state.blockedUntil <= now) {
      failuresByClient.delete(clientId);
    }
  }

  if (failuresByClient.size <= maxTrackedClients) {
    return;
  }

  const entriesByAge = [...failuresByClient.entries()].sort((a, b) => a[1].lastSeenAt - b[1].lastSeenAt);
  const overflowCount = failuresByClient.size - maxTrackedClients;
  for (let index = 0; index < overflowCount; index += 1) {
    const entry = entriesByAge[index];
    if (entry) {
      failuresByClient.delete(entry[0]);
    }
  }
}

function countFailedAttempt(
  failuresByClient: Map<string, AuthFailureState>,
  clientId: string,
  now: number,
  failureWindowMs: number,
  maxAttemptsPerWindow: number,
  blockDurationMs: number,
  stateTtlMs: number,
  maxTrackedClients: number
): void {
  pruneFailures(failuresByClient, now, stateTtlMs, maxTrackedClients);

  const existing =
    failuresByClient.get(clientId) ??
    ({
      attempts: 0,
      windowStartedAt: now,
      blockedUntil: 0,
      lastSeenAt: now
    } satisfies AuthFailureState);

  existing.lastSeenAt = now;

  if (existing.blockedUntil > now) {
    throw new TooManyRequestsError('Too many invalid API key attempts', {
      retryAfterMs: existing.blockedUntil - now
    });
  }

  if (existing.blockedUntil <= now && existing.blockedUntil > 0) {
    existing.attempts = 0;
    existing.blockedUntil = 0;
    existing.windowStartedAt = now;
  }

  if (now - existing.windowStartedAt >= failureWindowMs) {
    existing.attempts = 0;
    existing.windowStartedAt = now;
  }

  existing.attempts += 1;

  if (existing.attempts >= maxAttemptsPerWindow) {
    existing.attempts = 0;
    existing.blockedUntil = now + blockDurationMs;
    failuresByClient.set(clientId, existing);
    throw new TooManyRequestsError('Too many invalid API key attempts', {
      retryAfterMs: blockDurationMs
    });
  }

  failuresByClient.set(clientId, existing);
}

export function buildApiKeyAuth(expectedApiKey: string, options: ApiKeyAuthOptions = {}): preHandlerHookHandler {
  const failureWindowMs = options.failureWindowMs ?? DEFAULT_FAILURE_WINDOW_MS;
  const maxAttemptsPerWindow = options.maxAttemptsPerWindow ?? DEFAULT_MAX_ATTEMPTS_PER_WINDOW;
  const blockDurationMs = options.blockDurationMs ?? DEFAULT_BLOCK_DURATION_MS;
  const stateTtlMs = options.stateTtlMs ?? DEFAULT_STATE_TTL_MS;
  const maxTrackedClients = options.maxTrackedClients ?? DEFAULT_MAX_TRACKED_CLIENTS;
  const now = options.now ?? Date.now;
  const failuresByClient = new Map<string, AuthFailureState>();

  return async function apiKeyAuth(_request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const clientId = resolveClientIdentifier(_request);
    const nowTs = now();
    pruneFailures(failuresByClient, nowTs, stateTtlMs, maxTrackedClients);

    const authorization = _request.headers.authorization;

    if (typeof authorization !== 'string') {
      countFailedAttempt(
        failuresByClient,
        clientId,
        nowTs,
        failureWindowMs,
        maxAttemptsPerWindow,
        blockDurationMs,
        stateTtlMs,
        maxTrackedClients
      );
      throw new UnauthorizedError();
    }

    const token = extractBearerToken(authorization);
    if (!token || !compareApiKey(token, expectedApiKey)) {
      countFailedAttempt(
        failuresByClient,
        clientId,
        nowTs,
        failureWindowMs,
        maxAttemptsPerWindow,
        blockDurationMs,
        stateTtlMs,
        maxTrackedClients
      );
      throw new UnauthorizedError();
    }

    failuresByClient.delete(clientId);
  };
}
