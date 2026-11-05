import { Repository } from 'typeorm';
import { PropertyService } from './property.service';
import { Property } from './entities/property.entity';
import { UserService } from '../user/user.service';
import { ServiceService } from '../service/service.service';
import { PropertyStatus } from './property-status.enum';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

describe('First property onboarding', () => {
  const ensureRole = jest.fn();
  const save = jest.fn(async (value: unknown) => value);
  const findOne = jest.fn();
  const query = { where: jest.fn().mockReturnThis(), setLock: jest.fn().mockReturnThis(), getOne: () => findOne() };
  const repository = { create: (value: unknown) => value, save, findOne, createQueryBuilder: () => query };
  const service = new PropertyService(
    { ...repository, manager: { transaction: async (work: (manager: unknown) => unknown) => work({ getRepository: () => repository }) } } as unknown as Repository<Property>,
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

  it.each(['review', 'remove'] as const)('blocks %s for a reserved property without changing its data', async (action) => {
    const property = { status: PropertyStatus.ACTIVE, reservedTenantId: 7, reviewNote: 'Nota anterior' };
    findOne.mockResolvedValue(property);
    const result = action === 'review'
      ? service.review(5, { status: PropertyStatus.INACTIVE, note: 'Desactivar' })
      : service.remove(5);
    await expect(result).rejects.toMatchObject({
      constructor: ConflictException,
      response: { code: 'API_NO_SE_PUEDE_INACTIVAR_UNA_PROPIEDAD_RESERVADA' },
    });
    expect(query.setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(save).not.toHaveBeenCalled();
    expect(property).toEqual({ status: PropertyStatus.ACTIVE, reservedTenantId: 7, reviewNote: 'Nota anterior' });
  });

  it.each(['review', 'remove'] as const)('allows %s once the reservation is released', async (action) => {
    findOne.mockResolvedValue({ status: PropertyStatus.ACTIVE, reservedTenantId: null });
    const result = action === 'review'
      ? await service.review(5, { status: PropertyStatus.INACTIVE, note: 'Desactivar' })
      : await service.remove(5);
    expect(result.status).toBe(PropertyStatus.INACTIVE);
    expect(save).toHaveBeenCalledTimes(1);
    if (action === 'review') expect(result).toMatchObject({ reviewNote: 'Desactivar', reviewedAt: expect.any(Date) });
  });

  it('still rejects reviewing a draft', async () => {
    findOne.mockResolvedValue({ status: PropertyStatus.DRAFT, reservedTenantId: null });
    await expect(service.review(5, { status: PropertyStatus.INACTIVE })).rejects.toBeInstanceOf(BadRequestException);
    expect(save).not.toHaveBeenCalled();
  });

  it.each(['review', 'remove'] as const)('rejects %s for a missing property', async (action) => {
    findOne.mockResolvedValue(null);
    await expect(action === 'review' ? service.review(5, { status: PropertyStatus.INACTIVE }) : service.remove(5)).rejects.toBeInstanceOf(NotFoundException);
    expect(save).not.toHaveBeenCalled();
  });
});
