import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PropertyService } from './property.service';
import { Property } from './entities/property.entity';
import { PropertyFile } from './entities/property-file.entity';
import { IconDescription } from './entities/icon-description.entity';
import { TypeOfProperty } from './entities/type-of-property.entity';
import { User } from '../user/entities/user.entity';
import { UserService } from '../user/user.service';
import { ServiceService } from '../service/service.service';

describe('Tenant reserved properties', () => {
  const find = jest.fn();
  let service: PropertyService;

  beforeEach(async () => {
    find.mockReset();
    const module = await Test.createTestingModule({
      providers: [
        PropertyService,
        { provide: getRepositoryToken(Property), useValue: { find } },
        ...[PropertyFile, IconDescription, TypeOfProperty, User].map((entity) => ({
          provide: getRepositoryToken(entity), useValue: {},
        })),
        { provide: UserService, useValue: {} },
        { provide: ServiceService, useValue: {} },
      ],
    }).compile();
    service = module.get(PropertyService);
  });

  it('filters by the tenant and excludes private owner fields', async () => {
    find.mockResolvedValue([{
      id: 5, title: 'Casa', reservedAt: new Date(), files: [],
      owner: { id: 1, name: 'Ana', email: 'private@example.com', password: 'secret' },
    }]);
    const result = await service.findByTenant(7);
    expect(find).toHaveBeenCalledWith(expect.objectContaining({ where: { reservedTenantId: 7 } }));
    expect(result[0].owner).toEqual({ id: 1, name: 'Ana' });
    expect(result[0].id).toBe(5);
  });

  it('returns an empty list when the tenant has no reservations', async () => {
    find.mockResolvedValue([]);
    await expect(service.findByTenant(7)).resolves.toEqual([]);
  });
});
