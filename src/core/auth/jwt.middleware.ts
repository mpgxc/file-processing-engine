import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { jwtVerify, createRemoteJWKSet } from 'jose';
import { UnauthorizedError } from '../../commons/errors/app-errors.js';

@Injectable()
export class JwtMiddleware implements NestMiddleware {
  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const authHeader = req.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) {
      next(new UnauthorizedError('Missing or malformed Authorization header'));
      return;
    }
    const token = authHeader.slice(7);

    try {
      const secret = process.env['JWT_SECRET'];
      const jwksUri = process.env['JWT_JWKS_URI'];

      let payload: Record<string, unknown>;

      if (jwksUri) {
        const JWKS = createRemoteJWKSet(new URL(jwksUri));
        const { payload: p } = await jwtVerify(token, JWKS);
        payload = p;
      } else if (secret) {
        const { createSecretKey } = await import('node:crypto');
        const key = createSecretKey(Buffer.from(secret, 'utf8'));
        const { payload: p } = await jwtVerify(token, key);
        payload = p;
      } else {
        next(new UnauthorizedError('JWT configuration missing'));
        return;
      }

      (req as unknown as Record<string, unknown>)['tenantId'] =
        payload['tenantId'] ?? payload['tenant_id'] ?? '';
      (req as unknown as Record<string, unknown>)['userId'] =
        payload['sub'] ?? payload['userId'] ?? '';
      next();
    } catch (err: unknown) {
      if (err instanceof UnauthorizedError) {
        next(err);
      } else {
        next(new UnauthorizedError('Invalid or expired token'));
      }
    }
  }
}
