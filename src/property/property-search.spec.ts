import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import type { Server } from 'node:http';
import { DataSource, SelectQueryBuilder } from 'typeorm';
import { PropertyController } from './property.controller';
import { PropertyService } from './property.service';
import { Property } from './entities/property.entity';
import { PropertyFile } from './entities/property-file.entity';
import { TypeOfProperty } from './entities/type-of-property.entity';
import { IconDescription } from './entities/icon-description.entity';
import { User } from '../user/entities/user.entity';
import { Service } from '../service/entities/service.entity';
import { ServiceService } from '../service/service.service';

describe('Property search HTTP query', () => {
  let app: INestApplication;
  const service = { findAll: jest.fn(), findActive: jest.fn() };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PropertyController],
      providers: [{ provide: PropertyService, useValue: service }],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });
  beforeEach(() => {
    jest.clearAllMocks();
    service.findAll.mockResolvedValue([]);
    service.findActive.mockResolvedValue([]);
  });
  afterAll(async () => {
    await app.close();
  });

  it('returns 200 and an empty array when nothing matches', async () => {
    await request(app.getHttpServer() as Server)
      .get('/properties')
      .expect(200)
      .expect([]);
    expect(service.findAll).toHaveBeenCalledWith({});
  });
  it.each(['serviceIds=1,2', 'serviceIds=1&serviceIds=2'])(
    'parses %s into numeric IDs',
    async (query) => {
      await request(app.getHttpServer() as Server)
        .get(`/properties?${query}`)
        .expect(200);
      expect(service.findAll).toHaveBeenCalledWith({ serviceIds: [1, 2] });
    },
  );
  it('also supports filters on the active endpoint', async () => {
    await request(app.getHttpServer() as Server)
      .get('/properties/active?serviceIds=2')
      .expect(200);
    expect(service.findActive).toHaveBeenCalledWith({ serviceIds: [2] });
  });
  it.each([
    '',
    '0',
    '-1',
    '1.5',
    'abc',
    '1,',
    '1,1',
    '1e2',
    '2147483648',
    Array.from({ length: 51 }, (_, index) => index + 1).join(','),
  ])('rejects invalid IDs: %s', async (ids) => {
    await request(app.getHttpServer() as Server)
      .get(`/properties?serviceIds=${encodeURIComponent(ids)}`)
      .expect(400);
    expect(service.findAll).not.toHaveBeenCalled();
  });
});

describe('Property search SQL', () => {
  let service: PropertyService;
  let getMany: jest.SpyInstance;

  beforeAll(async () => {
    const source = new DataSource({
      type: 'postgres',
      entities: [
        Property,
        PropertyFile,
        IconDescription,
        TypeOfProperty,
        User,
        Service,
      ],
    });
    await source['buildMetadatas']();
    const module = await Test.createTestingModule({
      providers: [
        PropertyService,
        {
          provide: getRepositoryToken(Property),
          useValue: source.getRepository(Property),
        },
        { provide: ServiceService, useValue: {} },
        ...[TypeOfProperty, User, PropertyFile, IconDescription].map(
          (entity) => ({ provide: getRepositoryToken(entity), useValue: {} }),
        ),
      ],
    }).compile();
    service = module.get(PropertyService);
  });
  beforeEach(() => {
    getMany = jest
      .spyOn(SelectQueryBuilder.prototype, 'getMany')
      .mockResolvedValue([]);
  });
  afterEach(() => jest.restoreAllMocks());

  it('requires all selected services and still loads the complete services relation', async () => {
    await expect(service.findAll({ serviceIds: [2, 5] })).resolves.toEqual([]);
    const builder = getMany.mock.contexts[0] as SelectQueryBuilder<Property>;
    const [sql, params] = builder.getQueryAndParameters();
    expect(sql).toContain('LEFT JOIN "service" "services"');
    expect(sql).toContain('INNER JOIN "service" "selectedService0"');
    expect(sql).toContain('INNER JOIN "service" "selectedService1"');
    expect(sql).toContain('"selectedService0"."id" = $1');
    expect(sql).toContain('"selectedService1"."id" = $2');
    expect(sql).toContain('"property"."isActive" = $3');
    expect(params).toEqual([2, 5, true]);
    expect(sql).toContain('LEFT JOIN "property_file" "files"');
    expect(sql).not.toContain('"owner"."password"');
  });
  it('lists all active properties when filters are cleared', async () => {
    await service.findAll();
    const builder = getMany.mock.contexts[0] as SelectQueryBuilder<Property>;
    expect(builder.getQuery()).not.toContain('selectedService');
    expect(builder.getParameters()).toEqual({ isActive: true });
  });
});
