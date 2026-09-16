import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Server } from 'node:http';
import { ServiceController } from './service.controller';
import { ServiceService } from './service.service';

describe('Service HTTP API', () => {
  let app: INestApplication;
  const catalog = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ServiceController],
      providers: [{ provide: ServiceService, useValue: catalog }],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  beforeEach(() => jest.clearAllMocks());
  afterAll(async () => {
    await app.close();
  });

  it.each(['/services', '/service'])('lists the catalog at %s', async (url) => {
    catalog.findAll.mockResolvedValue([{ id: 1, name: 'Agua' }]);
    await request(app.getHttpServer() as Server)
      .get(url)
      .expect(200)
      .expect([{ id: 1, name: 'Agua' }]);
  });
  it('trims input and strips non-catalog fields', async () => {
    catalog.create.mockResolvedValue({
      id: 1,
      name: 'Internet',
      icono: 'wifi',
    });
    await request(app.getHttpServer() as Server)
      .post('/services')
      .send({ name: ' Internet ', icono: 'wifi', properties: [{ id: 1 }] })
      .expect(201);
    expect(catalog.create).toHaveBeenCalledWith({
      name: 'Internet',
      icono: 'wifi',
    });
  });
  it.each([
    {},
    { name: '   ' },
    { name: 1 },
    { name: 'x'.repeat(101) },
    { name: 'Agua', icono: 7 },
    { name: 'Agua', description: 'x'.repeat(256) },
  ])('rejects invalid creation: %j', async (body) => {
    await request(app.getHttpServer() as Server)
      .post('/services')
      .send(body)
      .expect(400);
    expect(catalog.create).not.toHaveBeenCalled();
  });
  it('rejects a non-numeric identifier', async () => {
    await request(app.getHttpServer() as Server)
      .get('/services/invalid')
      .expect(400);
    expect(catalog.findOne).not.toHaveBeenCalled();
  });
  it('rejects null names when editing', async () => {
    await request(app.getHttpServer() as Server)
      .patch('/services/1')
      .send({ name: null })
      .expect(400);
    expect(catalog.update).not.toHaveBeenCalled();
  });
  it('supports partial updates and clearing optional fields', async () => {
    await request(app.getHttpServer() as Server)
      .patch('/services/1')
      .send({ icono: null })
      .expect(200);
    expect(catalog.update).toHaveBeenCalledWith(1, { icono: null });
  });
  it('returns no content after deletion', async () => {
    await request(app.getHttpServer() as Server)
      .delete('/services/1')
      .expect(204);
    expect(catalog.remove).toHaveBeenCalledWith(1);
  });
});
