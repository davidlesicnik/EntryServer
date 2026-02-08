import { timingSafeEqual } from 'node:crypto';
import { type FastifyReply, type FastifyRequest, type preHandlerHookHandler } from 'fastify';
import { TooManyRequestsError, UnauthorizedError } from '../errors';

interface AuthFailureState {
  attempts: number;
  windowStartedAt: number;
  blockedUntil: number;
}

export interface ApiKeyAuthOptions {
  failureWindowMs?: number;
  maxAttemptsPerWindow?: number;
  blockDurationMs?: number;
  now?: () => number;
}

const DEFAULT_FAILURE_WINDOW_MS = 60_000;
const DEFAULT_MAX_ATTEMPTS_PER_WINDOW = 10;
const DEFAULT_BLOCK_DURATION_MS = 300_000;
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

function countFailedAttempt(
  failuresByClient: Map<string, AuthFailureState>,
  clientId: string,
  now: number,
  failureWindowMs: number,
  maxAttemptsPerWindow: number,
  blockDurationMs: number
): void {
  const existing =
    failuresByClient.get(clientId) ??
    ({
      attempts: 0,
      windowStartedAt: now,
      blockedUntil: 0
    } satisfies AuthFailureState);

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
  const now = options.now ?? Date.now;
  const failuresByClient = new Map<string, AuthFailureState>();

  return async function apiKeyAuth(_request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const clientId = _request.ip || 'unknown';
    const nowTs = now();

    const authorization = _request.headers.authorization;

    if (typeof authorization !== 'string') {
      countFailedAttempt(
        failuresByClient,
        clientId,
        nowTs,
        failureWindowMs,
        maxAttemptsPerWindow,
        blockDurationMs
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
        blockDurationMs
      );
      throw new UnauthorizedError();
    }

    failuresByClient.delete(clientId);
  };
}
