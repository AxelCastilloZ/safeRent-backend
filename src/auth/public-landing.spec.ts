jest.mock('@nestjs/jwt', () => ({ JwtService: class JwtService {} }));

import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { PropertyController } from '../property/property.controller';
import { PropertyService } from '../property/property.service';
import { ServiceController } from '../service/service.controller';
import { ServiceService } from '../service/service.service';
import { UserService } from '../user/user.service';
import { JwtAuthGuard } from './guard/jwt-auth.guard';
import { RolesGuard } from './guard/roles.guard';

describe('Public landing queries with global authentication guards', () => {
  let app: INestApplication;
  const verifyAsync = jest.fn();
  const findForAuth = jest.fn();

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PropertyController, ServiceController],
      providers: [
        { provide: PropertyService, useValue: {
          findAll: jest.fn().mockResolvedValue([{ id: 1, title: 'Publicada' }]),
          findActive: jest.fn().mockResolvedValue([]),
        } },
        { provide: ServiceService, useValue: {
          findAll: jest.fn().mockResolvedValue([{ id: 1, name: 'Internet' }]),
        } },
        { provide: JwtService, useValue: { verifyAsync } },
        { provide: UserService, useValue: { findForAuth } },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => { await app.close(); });

  it.each(['/service', '/properties', '/properties/active'])(
    'allows anonymous GET %s without checking a user or token',
    async (path) => {
      const response = await request(app.getHttpServer() as Server).get(path).expect(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(verifyAsync).not.toHaveBeenCalled();
      expect(findForAuth).not.toHaveBeenCalled();
    },
  );

  it('keeps service creation authenticated', async () => {
    await request(app.getHttpServer() as Server).post('/service').send({ name: 'Test' }).expect(401);
  });

  it('keeps property creation authenticated', async () => {
    await request(app.getHttpServer() as Server).post('/properties').send({}).expect(401);
  });

  it.each(['/properties/owner/1', '/properties/1'])(
    'keeps private property queries authenticated: %s',
    async (path) => { await request(app.getHttpServer() as Server).get(path).expect(401); },
  );

  it.each(['/service/1', '/properties/1'])(
    'keeps updates and deletions authenticated: %s',
    async (path) => {
      await request(app.getHttpServer() as Server).patch(path).send({}).expect(401);
      await request(app.getHttpServer() as Server).delete(path).expect(401);
    },
  );
});
