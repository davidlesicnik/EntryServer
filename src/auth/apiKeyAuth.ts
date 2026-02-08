import { type FastifyReply, type FastifyRequest, type preHandlerHookHandler } from 'fastify';
import { UnauthorizedError } from '../errors';

export function buildApiKeyAuth(expectedApiKey: string): preHandlerHookHandler {
  return async function apiKeyAuth(_request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const authorization = _request.headers.authorization;
    if (!authorization) {
      throw new UnauthorizedError();
    }

    const [scheme, token] = authorization.split(' ');
    if (scheme !== 'Bearer' || !token || token !== expectedApiKey) {
      throw new UnauthorizedError();
    }
  };
}
