import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { UserService } from '../../user/user.service';
import { AuthRequest, PUBLIC_KEY } from '../access';
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly users: UserService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthRequest>();

    const match = request.headers.authorization
      ?.match(/^Bearer ([^\s]+)$/i);

    if (!match) {
      throw new UnauthorizedException('Token requerido');
    }

    let payload: { sub: number; sv?: number };

    try {
      payload = await this.jwt.verifyAsync<{ sub: number; sv?: number }>(match[1]);
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }

    if (!Number.isInteger(payload.sub) || payload.sub <= 0) {
      throw new UnauthorizedException('Token inválido');
    }

    const user = await this.users.findForAuth(payload.sub);

    if (!user) {
      throw new UnauthorizedException('Usuario no disponible');
    }

    // Legacy tokens remain valid only until the account's first password reset.
    if ((payload.sv ?? 0) !== (user.sessionVersion ?? 0)) {
      throw new UnauthorizedException('La sesión ha expirado. Inicia sesión nuevamente.');
    }

    request.user = {
      id: user.id,
      name: user.name,
      surname1: user.surname1,
      email: user.email,
      roles: user.Roles
        .filter((role) => role.isActive)
        .map((role) => role.name),
    };

    return true;
  }
}
