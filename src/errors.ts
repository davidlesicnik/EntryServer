import { ZodError } from 'zod';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export class ConfigError extends AppError {
  constructor(message: string, details?: unknown) {
    super(500, 'config_error', message, details);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(400, 'validation_error', message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Missing or invalid API key') {
    super(401, 'unauthorized', message);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, details?: unknown) {
    super(404, 'not_found', message, details);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super(409, 'conflict', message, details);
  }
}

export class UpstreamError extends AppError {
  constructor(message: string, details?: unknown) {
    super(502, 'upstream_error', message, details);
  }
}

export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: unknown;
  };
}

export function toErrorEnvelope(error: unknown, requestId: string): { statusCode: number; payload: ErrorEnvelope } {
  if (error instanceof ZodError) {
    return {
      statusCode: 400,
      payload: {
        error: {
          code: 'validation_error',
          message: 'Invalid request',
          requestId,
          details: error.flatten()
        }
      }
    };
  }

  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      payload: {
        error: {
          code: error.code,
          message: error.message,
          requestId,
          details: error.details
        }
      }
    };
  }

  return {
    statusCode: 500,
    payload: {
      error: {
        code: 'internal_error',
        message: 'Unexpected internal error',
        requestId
      }
    }
  };
}
