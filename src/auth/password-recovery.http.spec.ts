import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { Server } from 'node:http';
import { AuthController } from './auth.controller';
import { ProfileService } from './profile.service';
import { AuthService } from './auth.service';
import { PasswordRecoveryService, RECOVERY_MESSAGE } from './password-recovery.service';

jest.mock('./auth.service', () => ({ AuthService: class {} }));

describe('Recovery HTTP contract', () => {
  let app: INestApplication;
  const recovery = { request: jest.fn(), reset: jest.fn() };
  beforeEach(async () => {
    jest.clearAllMocks();
    recovery.request.mockResolvedValue({ message: RECOVERY_MESSAGE });
    recovery.reset.mockResolvedValue({ message: 'Contraseña actualizada correctamente.' });
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: ProfileService, useValue: {} }, { provide: AuthService, useValue: {} }, { provide: PasswordRecoveryService, useValue: recovery } ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });
  afterEach(async () => { await app.close(); });
  it.each(['001234567', 'account@example.com'])('accepts unauthenticated requests for %s', async (identifier) => {
    const response = await request(app.getHttpServer() as Server).post('/auth/forgot-password').send({ identifier: ` ${identifier} ` }).expect(200);
    expect(response.body).toEqual({ message: RECOVERY_MESSAGE });
    expect(recovery.request).toHaveBeenCalledWith(identifier, expect.any(String));
  });
  it('rejects invalid identifiers before scheduling email', async () => {
    await request(app.getHttpServer() as Server).post('/auth/forgot-password').send({ identifier: 'bad@' }).expect(400);
    expect(recovery.request).not.toHaveBeenCalled();
  });
  it('accepts reset request and strips extra fields', async () => {
    await request(app.getHttpServer() as Server).post('/auth/reset-password').send({ token: 'opaque-token', password: 'Password123!', confirmPassword: 'Password123!' }).expect(200);
    expect(recovery.reset.mock.calls[0][0]).toEqual({ token: 'opaque-token', password: 'Password123!' });
  });
  it('rejects weak password before changing the account', async () => {
    await request(app.getHttpServer() as Server).post('/auth/reset-password').send({ token: 'opaque-token', password: 'weak' }).expect(400);
    expect(recovery.reset).not.toHaveBeenCalled();
  });
});

