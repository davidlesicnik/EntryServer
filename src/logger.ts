import pino, { type Logger } from 'pino';

export function buildLogger(level: string): Logger {
  return pino({
    level,
    redact: {
      paths: ['req.headers.authorization', 'config.bridgeApiKey', 'config.actualPassword', 'config.actualFilePassword'],
      censor: '[REDACTED]'
    }
  });
}
