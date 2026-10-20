import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { CurrencyController } from './currency.controller';
import { CurrencySyncService } from './currency-sync.service';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { RolesGuard } from '../auth/guard/roles.guard';
import { UserService } from '../user/user.service';
import { CurrencyService } from './currency.service';
import { CurrencyRepository } from './currency.repository';

jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }));
jest.mock('../user/user.service', () => ({ UserService: class {} }));

describe('Currency administration access', () => {
  let app: INestApplication;
  let role: string;
  const sync = { synchronize: jest.fn(), getStatus: jest.fn() };

  beforeEach(async () => {
    role = 'ADMIN';
    jest.clearAllMocks();
    sync.synchronize.mockResolvedValue({ status: 'succeeded', batchId: 1 });
    sync.getStatus.mockResolvedValue({ activeBatch: null, lastRun: null });
    const module = await Test.createTestingModule({
      controllers: [CurrencyController],
      providers: [
        { provide: CurrencySyncService, useValue: sync },
        CurrencyService,
        {
          provide: CurrencyRepository,
          useValue: {
            findConversionRates: () =>
              Promise.resolve({
                batchId: 1,
                ratesUpdatedAt: new Date('2026-10-20T06:00:00Z'),
                fromRate: '500',
                toRate: '1',
                stale: false,
              }),
          },
        },
        {
          provide: JwtService,
          useValue: { verifyAsync: () => Promise.resolve({ sub: 1, sv: 0 }) },
        },
        {
          provide: UserService,
          useValue: {
            findForAuth: () =>
              Promise.resolve({
                id: 1,
                name: 'Test',
                surname1: 'Admin',
                email: 'test@example.invalid',
                sessionVersion: 0,
                Roles: [{ name: role, isActive: true }],
              }),
          },
        },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('requires authentication on both endpoints', async () => {
    await request(app.getHttpServer() as Server)
      .get('/currency/status')
      .expect(401);
    await request(app.getHttpServer() as Server)
      .post('/currency/sync')
      .expect(401);
    expect(sync.synchronize).not.toHaveBeenCalled();
  });

  it.each(['CLIENT', 'OWNER'])('rejects the %s role', async (value) => {
    role = value;
    await request(app.getHttpServer() as Server)
      .post('/currency/sync')
      .set('Authorization', 'Bearer test')
      .expect(403);
    await request(app.getHttpServer() as Server)
      .get('/currency/status')
      .set('Authorization', 'Bearer test')
      .expect(403);
    expect(sync.synchronize).not.toHaveBeenCalled();
  });

  it('allows an administrator to inspect status without downloading', async () => {
    await request(app.getHttpServer() as Server)
      .get('/currency/status')
      .set('Authorization', 'Bearer test')
      .expect(200, { activeBatch: null, lastRun: null });
    expect(sync.synchronize).not.toHaveBeenCalled();
  });

  it('allows an administrator to synchronize manually', async () => {
    await request(app.getHttpServer() as Server)
      .post('/currency/sync')
      .set('Authorization', 'Bearer test')
      .expect(200, { status: 'succeeded', batchId: 1 });
    expect(sync.synchronize).toHaveBeenCalledTimes(1);
  });

  it('requires authentication for the local converter', async () => {
    await request(app.getHttpServer() as Server)
      .get('/currency/convert?amount=250000&from=CRC&to=USD')
      .expect(401);
  });

  it.each(['ADMIN', 'CLIENT', 'OWNER'])(
    'allows %s to convert using stored rates',
    async (value) => {
      role = value;
      const response = await request(app.getHttpServer() as Server)
        .get('/currency/convert?amount=250000&from=crc&to=usd&rate=999')
        .set('Authorization', 'Bearer test')
        .expect(200);
      expect((response.body as { converted: unknown }).converted).toEqual({
        amount: '500.00',
        currency: 'USD',
      });
      expect(sync.synchronize).not.toHaveBeenCalled();
    },
  );

  it.each([
    'amount=-1&from=CRC&to=USD',
    'amount=1e3&from=CRC&to=USD',
    'amount=1&amount=2&from=CRC&to=USD',
    'amount=1&from=CRC',
    'amount=1&from=CRC&to=DOGE',
  ])('rejects malformed conversion query %s', async (query) => {
    await request(app.getHttpServer() as Server)
      .get('/currency/convert?' + query)
      .set('Authorization', 'Bearer test')
      .expect(400);
    expect(sync.synchronize).not.toHaveBeenCalled();
  });
});
