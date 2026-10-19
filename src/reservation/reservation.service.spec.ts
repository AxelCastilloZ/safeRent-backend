import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ReservationService } from './reservation.service';
import { Conversation } from '../messages/conversation/entities/conversation.entity';
import { Property } from '../property/entities/property.entity';

describe('Reservation from a conversation', () => {
  function setup(ownerId = 1, reservedTenantId: number | null = null, status = 'ACTIVE') {
    const property = { id: 5, ownerId: 1, status, reservedTenantId, reservedTenantName: 'Ana Pérez', reservedAt: null };
    const builder = { where: jest.fn().mockReturnThis(), setLock: jest.fn().mockReturnThis(), getOne: jest.fn().mockResolvedValue(property) };
    const save = jest.fn();
    const manager = {
      getRepository: (entity: unknown) => entity === Conversation
        ? { findOne: jest.fn().mockResolvedValue({ property: { id: 5 }, participants: [{ id: 1 }, { id: 2 }] }) }
        : entity === Property ? { createQueryBuilder: () => builder, save }
        : { findOneBy: jest.fn().mockResolvedValue({ id: 2, name: 'Ana', surname1: 'Pérez', isActive: true }) },
    };
    const service = new ReservationService({ transaction: (work: (m: typeof manager) => unknown) => work(manager) } as unknown as DataSource);
    return { reserve: () => service.reserve(8, ownerId), release: () => service.release(5, ownerId), property, builder, save };
  }

  it('links the tenant and keeps the approved property active', async () => {
    const test = setup();
    const result = await test.reserve();
    expect(result.reservedTenantId).toBe(2);
    expect(result.reservedTenantName).toBe('Ana Pérez');
    expect(test.property.status).toBe('ACTIVE');
    expect(test.builder.setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(test.save).toHaveBeenCalledTimes(1);
  });

  it('removes the reservation and keeps the property available', async () => {
    const test = setup(1, 2);
    await test.release();
    expect(test.property).toMatchObject({ reservedTenantId: null, reservedTenantName: null, reservedAt: null, reservedTenant: null, status: 'ACTIVE' });
    expect(test.save).toHaveBeenCalledTimes(1);
  });

  it('does not let another user release the reservation', async () => {
    const test = setup(2, 2);
    await expect(test.release()).rejects.toBeInstanceOf(ForbiddenException);
    expect(test.save).not.toHaveBeenCalled();
  });

  it('does not allow a tenant or another owner to reserve', async () => {
    const test = setup(2);
    await expect(test.reserve()).rejects.toBeInstanceOf(ForbiddenException);
    expect(test.save).not.toHaveBeenCalled();
  });

  it('does not replace a reservation for another tenant', async () => {
    const test = setup(1, 3);
    await expect(test.reserve()).rejects.toBeInstanceOf(ConflictException);
    expect(test.save).not.toHaveBeenCalled();
  });

  it('accepts retries without changing the reservation', async () => {
    const test = setup(1, 2);
    expect((await test.reserve()).reservedTenantId).toBe(2);
    expect(test.save).not.toHaveBeenCalled();
  });

  it('does not reserve an unapproved property', async () => {
    const test = setup(1, null, 'PENDING');
    await expect(test.reserve()).rejects.toBeInstanceOf(BadRequestException);
    expect(test.save).not.toHaveBeenCalled();
  });
});
