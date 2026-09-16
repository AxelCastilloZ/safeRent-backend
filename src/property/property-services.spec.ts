import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DataSource } from 'typeorm';
import { ServiceService } from '../service/service.service';
import { Service } from '../service/entities/service.entity';
import { User } from '../user/entities/user.entity';
import { Property } from './entities/property.entity';
import { PropertyFile } from './entities/property-file.entity';
import { IconDescription } from './entities/icon-description.entity';
import { TypeOfProperty } from './entities/type-of-property.entity';
import { PropertyService } from './property.service';
import { UpdatePropertyDto } from './dto/update-property.dto';

describe('Property service selection', () => {
  let properties: PropertyService;
  const water = { id: 1, name: 'Agua' };
  const catalog = { findByIds: jest.fn() };
  const repo = { create: jest.fn(), save: jest.fn(), findOne: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    repo.create.mockImplementation((data: object) => data);
    repo.save.mockImplementation((data: object) => Promise.resolve(data));
    repo.findOne.mockResolvedValue({ id: 1, title: 'Casa', services: [water] });
    catalog.findByIds.mockResolvedValue([water]);
    const module = await Test.createTestingModule({
      providers: [
        PropertyService,
        { provide: ServiceService, useValue: catalog },
        { provide: getRepositoryToken(Property), useValue: repo },
        {
          provide: getRepositoryToken(User),
          useValue: { findOneBy: jest.fn().mockResolvedValue({ id: 7 }) },
        },
        ...[PropertyFile, IconDescription, TypeOfProperty].map((entity) => ({
          provide: getRepositoryToken(entity),
          useValue: {},
        })),
      ],
    }).compile();
    properties = module.get(PropertyService);
  });

  it('creates a draft linked to existing catalog entries', async () => {
    const result = await properties.create({
      title: 'Casa',
      description: 'Casa céntrica',
      cost: 250000,
      address: 'San José',
      ownerId: 7,
      serviceIds: [1],
    });
    expect(catalog.findByIds).toHaveBeenCalledWith([1]);
    expect(result).toMatchObject({
      services: [water],
      isActive: false,
      owner: { id: 7 },
    });
    expect(result).not.toHaveProperty('serviceIds');
  });
  it('replaces selected services when editing', async () => {
    const internet = { id: 2, name: 'Internet' };
    catalog.findByIds.mockResolvedValue([internet]);
    await expect(
      properties.update(1, { serviceIds: [2] }),
    ).resolves.toMatchObject({ services: [internet] });
  });
  it('clears assignments with an empty array', async () => {
    catalog.findByIds.mockResolvedValue([]);
    await expect(
      properties.update(1, { serviceIds: [] }),
    ).resolves.toMatchObject({ services: [] });
  });
  it('preserves assignments when serviceIds is omitted', async () => {
    await expect(
      properties.update(1, { title: 'Nuevo título' }),
    ).resolves.toMatchObject({ services: [water] });
    expect(catalog.findByIds).not.toHaveBeenCalled();
  });
  it('does not persist an unknown service selection', async () => {
    catalog.findByIds.mockRejectedValueOnce(new NotFoundException());
    await expect(
      properties.update(1, { serviceIds: [99] }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.save).not.toHaveBeenCalled();
  });
  it.each([
    { ids: [1, 1] },
    { ids: [0] },
    { ids: [-1] },
    { ids: [1.5] },
    { ids: ['1'] },
  ])('rejects invalid selections: %j', async ({ ids }) => {
    const errors = await validate(
      plainToInstance(UpdatePropertyDto, { serviceIds: ids }),
    );
    expect(errors.some((error) => error.property === 'serviceIds')).toBe(true);
  });
  it('retains the join table and prevents deleting assigned services', async () => {
    const source = new DataSource({
      type: 'postgres',
      entities: [
        Property,
        Service,
        User,
        PropertyFile,
        IconDescription,
        TypeOfProperty,
      ],
    });
    // Metadata validation does not connect to or modify the database.
    await source['buildMetadatas']();
    const relation = source
      .getMetadata(Property)
      .relations.find((item) => item.propertyName === 'services')!;
    expect(relation.isManyToMany).toBe(true);
    expect(relation.isEager).toBe(true);
    expect(relation.junctionEntityMetadata?.tableName).toBe(
      'property_services_service',
    );
    const serviceForeignKey = relation.junctionEntityMetadata?.foreignKeys.find(
      (key) => key.referencedEntityMetadata.target === Service,
    );
    expect(serviceForeignKey?.onDelete).toBe('RESTRICT');
    expect(
      source.entityMetadatas.filter((entity) => entity.tableName === 'service'),
    ).toHaveLength(1);
  });
});
