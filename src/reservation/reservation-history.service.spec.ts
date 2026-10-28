import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Property } from '../property/entities/property.entity';
import { Reservation } from './entities/reservation.entity';
import { ReservationHistoryService } from './reservation-history.service';

describe('Reservation history', () => {
  const rows = [
    {
      id: 2, startedAt: new Date('2026-10-20'), endedAt: null, endReason: null, propertyId: 5, tenantId: 2, ownerId: 1,
      property: { title: 'Casa', address: 'San José' }, tenant: { name: 'Ana', surname1: 'Pérez' }, owner: { name: 'Luis', surname1: 'Mora' },
    },
    {
      id: 1, startedAt: new Date('2026-09-01'), endedAt: new Date('2026-09-30'), endReason: 'Se mudó', propertyId: 5, tenantId: 3, ownerId: 1,
      property: { title: 'Casa', address: 'San José' }, tenant: { name: 'Juan', surname1: 'Solís' }, owner: { name: 'Luis', surname1: 'Mora' },
    },
  ];

  function setup(property: { id: number; ownerId: number } | null = { id: 5, ownerId: 1 }) {
    const find = jest.fn().mockResolvedValue(rows);
    const builder = {
      select: jest.fn().mockReturnThis(), addSelect: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(), getRawMany: jest.fn().mockResolvedValue([{ propertyId: '5', timesRented: '2' }]),
    };
    const dataSource = {
      getRepository: (entity: unknown) => entity === Reservation
        ? { find, createQueryBuilder: () => builder }
        : entity === Property ? { findOneBy: jest.fn().mockResolvedValue(property) } : {},
    } as unknown as DataSource;
    return { service: new ReservationHistoryService(dataSource), find };
  }

  const owner = { id: 1, roles: ['OWNER'] };
  const tenant = { id: 2, roles: ['CLIENT'] };
  const stranger = { id: 9, roles: ['CLIENT'] };
  const admin = { id: 7, roles: ['ADMIN'] };

  it('lets a tenant see only their own history', async () => {
    const test = setup();
    const history = await test.service.forTenant(2, tenant);
    expect(test.find).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 2 } }));
    expect(history[0]).toMatchObject({ active: true, property: { id: 5, title: 'Casa' }, owner: { name: 'Luis' } });
    expect(history[1]).toMatchObject({ active: false, endReason: 'Se mudó' });
    await expect(test.service.forTenant(2, stranger)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets an administrator see any user history', async () => {
    const test = setup();
    await expect(test.service.forTenant(2, admin)).resolves.toHaveLength(2);
  });

  it('shows the property history and how many times it was rented to its owner or an administrator', async () => {
    const test = setup();
    const result = await test.service.forProperty(5, owner);
    expect(result).toMatchObject({ propertyId: 5, timesRented: 2 });
    expect(result.reservations[1].tenant.name).toBe('Juan Solís');
    await expect(test.service.forProperty(5, admin)).resolves.toMatchObject({ timesRented: 2 });
    await expect(test.service.forProperty(5, tenant)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('fails for a property that does not exist', async () => {
    const test = setup(null);
    await expect(test.service.forProperty(99, admin)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('counts rentals per property only for the owner or an administrator', async () => {
    const test = setup();
    await expect(test.service.countsForOwner(1, owner)).resolves.toEqual([{ propertyId: 5, timesRented: 2 }]);
    await expect(test.service.countsForOwner(1, stranger)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
