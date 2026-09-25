import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppRole, AuthRequest, PUBLIC_KEY, ROLES_KEY } from '../access';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];

    if (
      this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets)
    ) {
      return true;
    }

    const required = this.reflector.getAllAndOverride<AppRole[]>(
      ROLES_KEY,
      targets,
    );

    if (!required?.length) return true;

    const request = context.switchToHttp().getRequest<AuthRequest>();

    return required.some((role) =>
      request.user?.roles.includes(role),
    );
  }
}