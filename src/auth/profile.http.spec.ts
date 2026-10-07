import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import type { Server } from 'node:http';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordRecoveryService } from './password-recovery.service';
import { ProfileService } from './profile.service';
import { JwtAuthGuard } from './guard/jwt-auth.guard';
import { UserService } from '../user/user.service';

jest.mock('./auth.service', () => ({ AuthService: class {} }));
jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }));
jest.mock('../user/user.service', () => ({ UserService: class {} }));

const validProfile = { name: 'José', surname1: 'Pérez', surname2: '', email: 'jose@example.com', phoneNumber: '88888888', birthdate: '2000-01-01' };
describe('Authenticated profile HTTP contract', () => {
  let app: INestApplication;
  const profile = { get: jest.fn(), update: jest.fn(), changePassword: jest.fn() };
  beforeEach(async () => {
    jest.clearAllMocks();
    profile.get.mockResolvedValue({ id: 7, ...validProfile });
    profile.update.mockResolvedValue({ id: 7, ...validProfile });
    profile.changePassword.mockResolvedValue({ message: 'Contraseña actualizada.' });
    const module = await Test.createTestingModule({ controllers: [AuthController], providers: [
      { provide: AuthService, useValue: {} }, { provide: PasswordRecoveryService, useValue: {} },
      { provide: ProfileService, useValue: profile },
      { provide: JwtService, useValue: { verifyAsync: async () => ({ sub: 7, sv: 0 }) } },
      { provide: UserService, useValue: { findForAuth: async () => ({ id: 7, name: 'José', surname1: 'Pérez', email: 'jose@example.com', sessionVersion: 0, Roles: [{ name: 'CLIENT', isActive: true }] }) } },
      { provide: APP_GUARD, useClass: JwtAuthGuard },
    ] }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });
  afterEach(async () => { await app.close(); });
  it('requires authentication to view the profile', async () => {
    await request(app.getHttpServer() as Server).get('/auth/profile').expect(401);
    expect(profile.get).not.toHaveBeenCalled();
  });
  it('reads only the authenticated identity', async () => {
    await request(app.getHttpServer() as Server).get('/auth/profile?id=99').set('Authorization', 'Bearer test').expect(200);
    expect(profile.get).toHaveBeenCalledWith(7);
  });
  it('ignores identity, credentials and role injection in profile updates', async () => {
    await request(app.getHttpServer() as Server).patch('/auth/profile').set('Authorization', 'Bearer test').send({ ...validProfile, id: 99, idCard: 'changed', roleId: 1, isActive: false, password: 'Injected123!' }).expect(200);
    const [id, dto] = profile.update.mock.calls[0];
    expect(id).toBe(7);
    for (const field of ['id', 'idCard', 'roleId', 'isActive', 'password']) expect(dto[field]).toBeUndefined();
    expect(dto.birthdate).toBeInstanceOf(Date);
  });
  it('rejects whitespace-only names', async () => {
    await request(app.getHttpServer() as Server).patch('/auth/profile').set('Authorization', 'Bearer test').send({ ...validProfile, name: '  ' }).expect(400);
    expect(profile.update).not.toHaveBeenCalled();
  });
  it('validates strong passwords on the protected change endpoint', async () => {
    await request(app.getHttpServer() as Server).post('/auth/change-password').set('Authorization', 'Bearer test').send({ currentPassword: 'Old123!', password: 'weak' }).expect(400);
    expect(profile.changePassword).not.toHaveBeenCalled();
  });
  it('passes only current and new password using authenticated identity', async () => {
    await request(app.getHttpServer() as Server).post('/auth/change-password').set('Authorization', 'Bearer test').send({ currentPassword: 'Old123!', password: 'NewPass123!', confirmPassword: 'NewPass123!', id: 99 }).expect(200);
    expect(profile.changePassword).toHaveBeenCalledWith(7, expect.objectContaining({ currentPassword: 'Old123!', password: 'NewPass123!' }));
    expect(profile.changePassword.mock.calls[0][1].id).toBeUndefined();
  });
});
