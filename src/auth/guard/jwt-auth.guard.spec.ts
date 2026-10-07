import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { JwtService } from '@nestjs/jwt';
import type { UserService } from '../../user/user.service';
import { JwtAuthGuard } from './jwt-auth.guard';

jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }));
jest.mock('../../user/user.service', () => ({ UserService: class {} }));

describe('Authenticated account identity', () => {
  const verifyAsync = jest.fn();
  const findForAuth = jest.fn();
  const guard = new JwtAuthGuard(
    { getAllAndOverride: () => false } as unknown as Reflector,
    { verifyAsync } as unknown as JwtService,
    { findForAuth } as unknown as UserService,
  );

  function context(request: object) {
    return {
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => jest.resetAllMocks());

  it('exposes initials data and active roles without private user fields', async () => {
    verifyAsync.mockResolvedValue({ sub: 1 });
    findForAuth.mockResolvedValue({
      id: 1, name: 'José', surname1: 'Pérez', email: 'jose@example.com', password: 'private hash', idCard: 'private ID',
      Roles: [{ name: 'CLIENT', isActive: true }, { name: 'OWNER', isActive: false }],
    });
    const request = { headers: { authorization: 'Bearer valid-token' }, user: undefined };
    await expect(guard.canActivate(context(request))).resolves.toBe(true);
    expect(request.user).toEqual({ id: 1, name: 'José', surname1: 'Pérez', email: 'jose@example.com', roles: ['CLIENT'] });
  });

  it('rejects expired tokens before loading account identity', async () => {
    verifyAsync.mockRejectedValue(new Error('expired'));
    const request = { headers: { authorization: 'Bearer expired-token' } };
    await expect(guard.canActivate(context(request))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(findForAuth).not.toHaveBeenCalled();
  });

  it.each([undefined, 0])('rejects old session version %s after a password reset', async (sv) => {
    verifyAsync.mockResolvedValue({ sub: 1, sv });
    findForAuth.mockResolvedValue({ id: 1, sessionVersion: 1 });
    const request = { headers: { authorization: 'Bearer old-token' } };
    await expect(guard.canActivate(context(request))).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
