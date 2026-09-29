import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  ServiceUnavailableException,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import * as jwt from 'jsonwebtoken';
import jwksClient, { JwksClient } from 'jwks-rsa';
import type { Pool } from 'pg';

export type AppRole = 'ADMIN' | 'LEADER' | 'SALES';
export type CurrentUser = { id: string; role: AppRole; displayName: string };
export type AuthedRequest = Request & { currentUser?: CurrentUser };

export const Public = () => SetMetadata('publicRoute', true);

@Injectable()
export class OidcGuard implements CanActivate {
  private client?: JwksClient;

  constructor(
    private readonly reflector: Reflector,
    @Inject('PG_POOL') private readonly db: Pool,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>('publicRoute', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const issuer = process.env.OIDC_ISSUER;
    const audience = process.env.OIDC_AUDIENCE;
    const jwksUri = process.env.OIDC_JWKS_URI;
    if (!issuer || !audience || !jwksUri || !process.env.DATABASE_URL) {
      throw new ServiceUnavailableException('Authentication is not configured');
    }

    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const match = /^Bearer (.+)$/i.exec(request.headers.authorization ?? '');
    if (!match) throw new UnauthorizedException('Bearer token required');
    const token = match[1];
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || typeof decoded === 'string' || !decoded.header.kid) {
      throw new UnauthorizedException('Invalid token header');
    }

    let subject: string;
    try {
      this.client ??= jwksClient({ jwksUri, cache: true, rateLimit: true });
      const signingKey = await this.client.getSigningKey(decoded.header.kid);
      const claims = jwt.verify(token, signingKey.getPublicKey(), {
        issuer,
        audience,
        algorithms: ['RS256'],
        clockTolerance: 5,
      });
      if (typeof claims === 'string' || !claims.sub) throw new Error('Missing subject');
      subject = claims.sub;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Token validation failed');
    }
    let result;
    try {
      result = await this.db.query<{
        id: string; role: AppRole; display_name: string;
      }>(
        `SELECT id, role, display_name FROM app_users
         WHERE identity_subject = $1 AND is_active = true`,
        [subject],
      );
    } catch {
      throw new ServiceUnavailableException('User database is unavailable');
    }
    const user = result.rows[0];
    if (!user) throw new UnauthorizedException('Account is not active');
    request.currentUser = { id: user.id, role: user.role, displayName: user.display_name };
    return true;
  }
}
