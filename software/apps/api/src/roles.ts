import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AppRole, AuthedRequest } from './auth';

const ROLES_KEY = 'allowedRoles';

export const Roles = (...roles: AppRole[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const allowed = this.reflector.getAllAndOverride<AppRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!allowed) return true;
    const user = context.switchToHttp().getRequest<AuthedRequest>().currentUser;
    if (user && allowed.includes(user.role)) return true;
    throw new ForbiddenException('Insufficient role');
  }
}
