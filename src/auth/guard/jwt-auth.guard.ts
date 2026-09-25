import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { UserService } from 'src/user/user.service';
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

    let payload: { sub: number };

    try {
      payload = await this.jwt.verifyAsync<{ sub: number }>(match[1]);
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

    request.user = {
      id: user.id,
      roles: user.Roles
        .filter((role) => role.isActive)
        .map((role) => role.name),
    };

    return true;
  }
}