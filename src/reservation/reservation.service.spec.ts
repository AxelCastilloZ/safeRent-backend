import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ReservationService } from './reservation.service';
import { Conversation } from '../messages/conversation/entities/conversation.entity';
import { Property } from '../property/entities/property.entity';
import { VisitService } from '../visit/visit.service';
import { VisitNotificationService } from '../visit/visit-notification.service';
import { ReservationNotificationService } from './reservation-notification.service';
import { Visit } from '../visit/entities/visit.entity';
import { Reservation } from './entities/reservation.entity';

describe('Reservation from a conversation', () => {
  function setup(ownerId = 1, reservedTenantId: number | null = null, status = 'ACTIVE', failCommit = false) {
    const property = { id: 5, title: 'Casa', ownerId: 1, status, reservedTenantId, reservedTenantName: 'Ana Pérez', reservedAt: null };
    const builder = { where: jest.fn().mockReturnThis(), setLock: jest.fn().mockReturnThis(), getOne: jest.fn().mockResolvedValue(property) };
    const save = jest.fn();
    const history = { insert: jest.fn(), update: jest.fn() };
    const manager = {
      getRepository: (entity: unknown) => entity === Reservation ? history
        : entity === Conversation
        ? { findOne: jest.fn().mockResolvedValue({ property: { id: 5 }, participants: [{ id: 1 }, { id: 2 }] }) }
        : entity === Property ? { createQueryBuilder: () => builder, save }
        : entity === Visit ? { findOneBy: jest.fn().mockResolvedValue({ id: 9, propertyId: 5, tenantId: 2, ownerId: 1, status: 'CONFIRMED' }) }
        : { findOneBy: jest.fn().mockResolvedValue({ id: 2, name: 'Ana', surname1: 'Pérez', isActive: true }) },
    };
    const notify = jest.fn().mockResolvedValue(undefined);
    const visitNotify = jest.fn().mockResolvedValue(true);
    const cancelForReservation = jest.fn().mockResolvedValue([10, 11]);
    let committed = false;
    const service = new ReservationService({ transaction: async (work: (m: typeof manager) => unknown) => {
      const result = await work(manager);
      if (failCommit) throw new Error('Commit failed');
      committed = true;
      return result;
    } } as unknown as DataSource,
    { cancelForReservation } as unknown as VisitService,
    { notify: visitNotify } as unknown as VisitNotificationService,
    { notify: (...args: unknown[]) => { expect(committed).toBe(true); return notify(...args); } } as unknown as ReservationNotificationService);
    return { reserve: () => service.reserve(8, ownerId), reserveFromVisit: () => service.reserveFromVisit(9, ownerId), release: (reason = 'Cambio de planes') => service.release(5, ownerId, reason), property, builder, save, notify, visitNotify, cancelForReservation, history };
  }

  it('links the tenant and keeps the approved property active', async () => {
    const test = setup();
    const result = await test.reserve();
    expect(result.reservedTenantId).toBe(2);
    expect(result.reservedTenantName).toBe('Ana Pérez');
    expect(test.property.status).toBe('ACTIVE');
    expect(test.builder.setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(test.save).toHaveBeenCalledTimes(1);
    expect(test.notify).toHaveBeenCalledWith('CONFIRMED', { propertyId: 5, property: 'Casa', ownerId: 1, tenantId: 2 });
    expect(test.cancelForReservation).toHaveBeenCalledWith(expect.anything(), 5, 2);
    expect(test.visitNotify.mock.calls).toEqual([[10, 'CANCELLED_PROPERTY_RESERVED'], [11, 'CANCELLED_PROPERTY_RESERVED']]);
  });

  it('removes the reservation and keeps the property available', async () => {
    const test = setup(1, 2);
    await test.release();
    expect(test.property).toMatchObject({ reservedTenantId: null, reservedTenantName: null, reservedAt: null, reservedTenant: null, status: 'ACTIVE' });
    expect(test.save).toHaveBeenCalledTimes(1);
    expect(test.notify).toHaveBeenCalledWith('RELEASED', { propertyId: 5, property: 'Casa', ownerId: 1, tenantId: 2, reason: 'Cambio de planes' });
  });

  it('also notifies when reserving from a confirmed visit', async () => {
    const test = setup();
    await test.reserveFromVisit();
    expect(test.notify).toHaveBeenCalledWith('CONFIRMED', { propertyId: 5, property: 'Casa', ownerId: 1, tenantId: 2 });
    expect(test.visitNotify).toHaveBeenCalledTimes(2);
    await test.reserveFromVisit();
    expect(test.notify).toHaveBeenCalledTimes(1);
  });

  it('opens a history entry when the property is reserved', async () => {
    const test = setup();
    await test.reserve();
    expect(test.history.insert).toHaveBeenCalledWith(expect.objectContaining({ propertyId: 5, tenantId: 2, ownerId: 1 }));
  });

  it('closes the history entry with the reason when the reservation is removed', async () => {
    const test = setup(1, 2);
    await test.release('  Cambio de planes ');
    const [where, changes] = test.history.update.mock.calls[0] as [{ propertyId: number }, { endedAt: Date; endReason: string }];
    expect(where.propertyId).toBe(5);
    expect(changes.endReason).toBe('Cambio de planes');
    expect(changes.endedAt).toBeInstanceOf(Date);
  });

  it('does not touch the history on retries or when there is nothing to release', async () => {
    const retry = setup(1, 2);
    await retry.reserve();
    expect(retry.history.insert).not.toHaveBeenCalled();
    const empty = setup();
    await empty.release();
    expect(empty.history.update).not.toHaveBeenCalled();
  });

  it('does not notify when the reservation transaction fails to commit', async () => {
    const test = setup(1, null, 'ACTIVE', true);
    await expect(test.reserve()).rejects.toThrow('Commit failed');
    expect(test.notify).not.toHaveBeenCalled();
    expect(test.visitNotify).not.toHaveBeenCalled();
  });

  it('does not notify when the cancellation transaction fails to commit', async () => {
    const test = setup(1, 2, 'ACTIVE', true);
    await expect(test.release()).rejects.toThrow('Commit failed');
    expect(test.notify).not.toHaveBeenCalled();
  });

  it('does not let another user release the reservation', async () => {
    const test = setup(2, 2);
    await expect(test.release()).rejects.toBeInstanceOf(ForbiddenException);
    expect(test.save).not.toHaveBeenCalled();
    expect(test.notify).not.toHaveBeenCalled();
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
    expect(test.notify).not.toHaveBeenCalled();
    expect(test.visitNotify).not.toHaveBeenCalled();
  });

  it('does not notify again when the reservation was already removed', async () => {
    const test = setup();
    await test.release();
    expect(test.notify).not.toHaveBeenCalled();
  });

  it.each(['', '   ', 'a'.repeat(501)])('requires a cancellation reason of at most 500 characters', async (reason) => {
    const test = setup(1, 2);
    await expect(test.release(reason)).rejects.toBeInstanceOf(BadRequestException);
    expect(test.save).not.toHaveBeenCalled();
    expect(test.notify).not.toHaveBeenCalled();
  });

  it('does not reserve an unapproved property', async () => {
    const test = setup(1, null, 'PENDING');
    await expect(test.reserve()).rejects.toBeInstanceOf(BadRequestException);
    expect(test.save).not.toHaveBeenCalled();
  });
});
