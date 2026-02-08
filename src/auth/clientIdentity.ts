import type { FastifyRequest } from 'fastify';

function firstNonEmptyValue(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const trimmed = item.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }

  return undefined;
}

export function resolveClientAddress(request: FastifyRequest): string {
  const xForwardedFor = firstNonEmptyValue(request.headers['x-forwarded-for']);
  if (xForwardedFor) {
    const [first] = xForwardedFor.split(',');
    const firstIp = first?.trim();
    if (firstIp) {
      return firstIp;
    }
  }

  return request.ip || 'unknown';
}

export function resolveClientIdentifier(request: FastifyRequest): string {
  return resolveClientAddress(request);
}
