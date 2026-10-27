import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { PropertyStatus } from './property-status.enum';
import { UpdatePropertyDto } from './dto/update-property.dto';
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
  const readyDraft = { title: 'Casa', description: 'Casa amplia', status: PropertyStatus.DRAFT, files: [{}, {}, {}], services: [{}] };
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
    findOne.mockResolvedValue({ ...readyDraft, ...property });
    await expect(service.publish(1)).rejects.toBeInstanceOf(BadRequestException);
    expect(save).not.toHaveBeenCalled();
  });
  it('submits a complete property with confirmed coordinates for administrative review', async () => {
    findOne.mockResolvedValue({ ...readyDraft, address: 'San José', latitude: 9.935, longitude: -84.084 });
    await expect(service.publish(1)).resolves.toMatchObject({ status: PropertyStatus.PENDING });
  });
  it('allows editing an incomplete draft while the HTTP DTO strips activation and ownership injection', async () => {
    findOne.mockResolvedValue({ ...readyDraft, address: '' });
    const pipe = new ValidationPipe({ transform: true, whitelist: true });
    const dto = await pipe.transform({ address: 'San José', status: 'ACTIVE', isActive: true, ownerId: 99 }, { type: 'body', metatype: UpdatePropertyDto });
    expect(dto).not.toHaveProperty('status');
    expect(dto).not.toHaveProperty('isActive');
    expect(dto).not.toHaveProperty('ownerId');
    await expect(service.update(1, dto)).resolves.toMatchObject({ address: 'San José', status: PropertyStatus.DRAFT });
    save.mockClear();
    await expect(service.publish(1)).rejects.toBeInstanceOf(BadRequestException);
    expect(save).not.toHaveBeenCalled();
  });
});
