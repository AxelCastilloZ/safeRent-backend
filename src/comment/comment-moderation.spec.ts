import { BadRequestException, INestApplication, NotFoundException, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import type { Server } from 'node:http';
import type { Request, Response, NextFunction } from 'express';
import { CommentService } from './comment.service';
import { CommentController } from './comment.controller';
import { RolesGuard } from '../auth/guard/roles.guard';

describe('Comment moderation', () => {
  const update = jest.fn();
  const service = new CommentService({ getRepository: () => ({ update }) } as unknown as DataSource);
  beforeEach(() => { update.mockReset(); update.mockResolvedValue({ affected: 1 }); });

  it('requires a reason when hiding', async () => {
    await expect(service.moderate(4, 1, { hidden: true, note: '  ' })).rejects.toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });
  it('records the administrator and reason', async () => {
    await service.moderate(4, 1, { hidden: true, note: ' Insultos ' });
    expect(update).toHaveBeenCalledWith(4, expect.objectContaining({ hidden: true, moderationNote: 'Insultos', moderatedById: 1, moderatedAt: expect.any(Date) }));
  });
  it('restores the comment without deleting its content', async () => {
    await service.moderate(4, 1, { hidden: false });
    expect(update).toHaveBeenCalledWith(4, expect.objectContaining({ hidden: false, moderationNote: null }));
    expect(update.mock.calls[0][1]).not.toHaveProperty('content');
  });
  it('rejects an unknown comment', async () => {
    update.mockResolvedValue({ affected: 0 });
    await expect(service.moderate(4, 1, { hidden: false })).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('Comment moderation HTTP permissions', () => {
  let app: INestApplication;
  const moderate = jest.fn().mockResolvedValue({ id: 4, hidden: true });
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [CommentController],
      providers: [{ provide: CommentService, useValue: { findForAdmin: () => [], moderate } }],
    }).compile();
    app = module.createNestApplication();
    // Test actors only; production identity is supplied by the global JWT guard.
    app.use((req: Request & { user?: { id: number; roles: string[] } }, _res: Response, next: NextFunction) => {
      req.user = { id: 1, roles: [String(req.headers['x-test-role'] || '')] };
      next();
    });
    app.useGlobalGuards(new RolesGuard(new Reflector()));
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });
  afterAll(async () => { await app.close(); });
  it.each(['CLIENT', 'OWNER', ''])('denies role %s', async (role) => {
    await request(app.getHttpServer() as Server).get('/comments/admin').set('x-test-role', role).expect(403);
    await request(app.getHttpServer() as Server).patch('/comments/4/moderation').set('x-test-role', role).send({ hidden: true, note: 'Insultos' }).expect(403);
  });
  it('allows an administrator', async () => {
    await request(app.getHttpServer() as Server).get('/comments/admin').set('x-test-role', 'ADMIN').expect(200);
    await request(app.getHttpServer() as Server).patch('/comments/4/moderation').set('x-test-role', 'ADMIN').send({ hidden: true, note: 'Insultos', moderatedById: 999 }).expect(200);
    expect(moderate).toHaveBeenCalledWith(4, 1, { hidden: true, note: 'Insultos' });
  });
  it('rejects a non-boolean state', async () => {
    await request(app.getHttpServer() as Server).patch('/comments/4/moderation').set('x-test-role', 'ADMIN').send({ hidden: 'true' }).expect(400);
  });
});
