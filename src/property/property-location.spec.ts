import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { PropertyService } from './property.service';
import { Property } from './entities/property.entity';
import { TypeOfProperty } from './entities/type-of-property.entity';
import { PropertyFile } from './entities/property-file.entity';
import { IconDescription } from './entities/icon-description.entity';
import { User } from '../user/entities/user.entity';
import { ServiceService } from '../service/service.service';
import { UserService } from '../user/user.service';

describe('Property location publishing', () => {
  const findOne = jest.fn();
  const save = jest.fn(async (property: Property) => property);
  const service = new PropertyService(
    { findOne, save } as unknown as Repository<Property>,
    {} as Repository<TypeOfProperty>, {} as ServiceService,
    {} as Repository<PropertyFile>, {} as Repository<IconDescription>, {} as Repository<User>,
    { ensureRole: jest.fn() } as unknown as UserService,
  );
  beforeEach(() => { save.mockClear(); });
  it.each([
    { address: '' },
    { address: 'San José', latitude: null, longitude: null },
    { address: 'San José', latitude: 9.9 },
    { address: 'San José', latitude: 91, longitude: 0 },
  ])('rejects publishing without a valid location: %j', async (property) => {
    findOne.mockResolvedValue(property);
    await expect(service.publish(1)).rejects.toBeInstanceOf(BadRequestException);
    expect(save).not.toHaveBeenCalled();
  });
  it('publishes a property with confirmed coordinates', async () => {
    findOne.mockResolvedValue({ address: 'San José', latitude: 9.935, longitude: -84.084 });
    await expect(service.publish(1)).resolves.toMatchObject({ isActive: true });
  });
  it('allows an incomplete draft location but rejects activating it through update', async () => {
    findOne.mockResolvedValue({ address: '', isActive: false });
    await expect(service.update(1, { address: 'San José' })).resolves.toMatchObject({ address: 'San José' });
    await expect(service.update(1, { isActive: true })).rejects.toBeInstanceOf(BadRequestException);
  });
});
