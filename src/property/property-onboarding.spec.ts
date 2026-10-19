import { Repository } from 'typeorm';
import { PropertyService } from './property.service';
import { Property } from './entities/property.entity';
import { UserService } from '../user/user.service';
import { ServiceService } from '../service/service.service';
import { PropertyStatus } from './property-status.enum';

describe('First property onboarding', () => {
  const ensureRole = jest.fn();
  const save = jest.fn(async (value: unknown) => value);
  const findOne = jest.fn();
  const service = new PropertyService(
    { create: (value: unknown) => value, save, findOne } as unknown as Repository<Property>,
    {} as never, { findByIds: async () => [] } as unknown as ServiceService,
    {} as never, {} as never,
    { findOneBy: async () => ({ id: 2 }) } as never,
    { ensureRole } as unknown as UserService,
  );
  beforeEach(() => { jest.clearAllMocks(); });
  it('creates a draft without granting OWNER', async () => {
    await expect(service.create({ ownerId: 2, title: 'Casa', description: 'Casa amplia', cost: 500 })).resolves.toMatchObject({ status: PropertyStatus.DRAFT });
    expect(ensureRole).not.toHaveBeenCalled();
  });
  it.each([PropertyStatus.ACTIVE, PropertyStatus.CHANGES_REQUESTED, PropertyStatus.INACTIVE])('grants OWNER only for approval: %s', async (status) => {
    findOne.mockResolvedValue({ owner: { id: 2 }, status: PropertyStatus.PENDING, title: 'Casa', description: 'Casa amplia', address: 'San José', latitude: 9.9, longitude: -84, files: [{}, {}, {}], services: [{}] });
    await service.review(5, { status });
    if (status === PropertyStatus.ACTIVE) expect(ensureRole).toHaveBeenCalledWith(2, 'OWNER');
    else expect(ensureRole).not.toHaveBeenCalled();
  });
});
