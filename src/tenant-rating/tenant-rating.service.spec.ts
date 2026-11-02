import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Reservation } from '../reservation/entities/reservation.entity';
import { User } from '../user/entities/user.entity';
import { TenantRating } from './entities/tenant-rating.entity';
import { summarize, TenantRatingService } from './tenant-rating.service';

describe('summarize', () => {
  it('averages with one decimal and counts each score', () => {
    expect(summarize([{ rating: 5 }, { rating: 4 }, { rating: 4 }])).toEqual({ average: 4.3, count: 3, distribution: { 1: 0, 2: 0, 3: 0, 4: 2, 5: 1 } });
  });

  it('has no average without ratings', () => {
    expect(summarize([])).toEqual({ average: null, count: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } });
  });
});

describe('TenantRatingService', () => {
  const reservations = { findOneBy: jest.fn(), find: jest.fn() };
  const ratings = { find: jest.fn(), findOneByOrFail: jest.fn() };
  const users = { findOne: jest.fn() };
  const query = jest.fn();
  const dataSource = {
    getRepository: (entity: unknown) => (entity === Reservation ? reservations : entity === TenantRating ? ratings : entity === User ? users : undefined),
    query,
  } as unknown as DataSource;
  const service = new TenantRatingService(dataSource);
  const owner = { id: 2, roles: ['OWNER'] };

  beforeEach(() => jest.resetAllMocks());

  describe('rate', () => {
    it('is not found for a missing reservation', async () => {
      reservations.findOneBy.mockResolvedValue(null);
      await expect(service.rate(9, 2, { rating: 5 })).rejects.toBeInstanceOf(NotFoundException);
      expect(query).not.toHaveBeenCalled();
    });

    it('only lets the owner of the reservation rate its tenant', async () => {
      reservations.findOneBy.mockResolvedValue({ id: 9, ownerId: 3, tenantId: 7 });
      await expect(service.rate(9, 2, { rating: 5 })).rejects.toBeInstanceOf(ForbiddenException);
      expect(query).not.toHaveBeenCalled();
    });

    it('saves in one statement, taking the tenant from the reservation and trimming a blank comment to nothing', async () => {
      reservations.findOneBy.mockResolvedValue({ id: 9, ownerId: 2, tenantId: 7 });
      ratings.findOneByOrFail.mockResolvedValue({ id: 1, reservationId: 9, tenantId: 7, rating: 4, comment: null, createdAt: 'c', updatedAt: 'u' });
      const result = await service.rate(9, 2, { rating: 4, comment: '   ' });
      expect(query).toHaveBeenCalledTimes(1);
      expect(query.mock.calls[0][0]).toContain('ON CONFLICT ("reservationId") DO UPDATE');
      expect(query.mock.calls[0][1]).toEqual([9, 7, 2, 4, null]);
      expect(result).toMatchObject({ reservationId: 9, tenantId: 7, rating: 4 });
    });
  });

  describe('forTenant', () => {
    const tenant = { id: 7, name: 'Ana', surname1: 'Mora', Roles: [{ name: 'CLIENT' }] };

    it('does not let a tenant read another tenant', async () => {
      await expect(service.forTenant(7, { id: 8, roles: ['CLIENT'] })).rejects.toBeInstanceOf(ForbiddenException);
      expect(users.findOne).not.toHaveBeenCalled();
    });

    it('does not exist for someone who is not a tenant', async () => {
      users.findOne.mockResolvedValue({ id: 7, name: 'Pedro', surname1: 'X', Roles: [{ name: 'OWNER' }] });
      await expect(service.forTenant(7, owner)).rejects.toBeInstanceOf(NotFoundException);
      users.findOne.mockResolvedValue(null);
      await expect(service.forTenant(7, owner)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('shows the score, only the owners’ names, and the viewer’s own reservations with their rating', async () => {
      users.findOne.mockResolvedValue(tenant);
      ratings.find.mockResolvedValue([
        { id: 1, rating: 5, comment: 'Excelente', createdAt: 'a', updatedAt: 'b', ownerId: 2, reservationId: 10, owner: { name: 'Pedro', email: 'private' }, reservation: { property: { title: 'Casa' } } },
        { id: 2, rating: 3, comment: null, createdAt: 'a', updatedAt: 'b', ownerId: 3, reservationId: 11, owner: { name: 'Luis', email: 'private' }, reservation: { property: { title: 'Cabaña' } } },
      ]);
      reservations.find.mockResolvedValue([
        { id: 10, propertyId: 1, startedAt: 's', endedAt: null, property: { title: 'Casa' } },
        { id: 12, propertyId: 4, startedAt: 's2', endedAt: 'e2', property: { title: 'Estudio' } },
      ]);

      const result = await service.forTenant(7, owner);

      expect(result.tenant).toEqual({ id: 7, name: 'Ana Mora' });
      expect(result.summary).toMatchObject({ average: 4, count: 2 });
      expect(result.ratings.map((row) => [row.owner, row.mine])).toEqual([[{ name: 'Pedro' }, true], [{ name: 'Luis' }, false]]);
      expect(JSON.stringify(result)).not.toContain('private');
      expect(result.myReservations).toEqual([
        { reservationId: 10, active: true, startedAt: 's', endedAt: null, property: { id: 1, title: 'Casa' }, myRating: { rating: 5, comment: 'Excelente' } },
        { reservationId: 12, active: false, startedAt: 's2', endedAt: 'e2', property: { id: 4, title: 'Estudio' }, myRating: null },
      ]);
    });

    it('lets a tenant see their own ratings but not reservation controls', async () => {
      users.findOne.mockResolvedValue(tenant);
      ratings.find.mockResolvedValue([]);
      const result = await service.forTenant(7, { id: 7, roles: ['CLIENT'] });
      expect(result.myReservations).toEqual([]);
      expect(reservations.find).not.toHaveBeenCalled();
    });
  });

  it('summary returns only the score', async () => {
    users.findOne.mockResolvedValue({ id: 7, name: 'Ana', surname1: 'Mora', Roles: [{ name: 'CLIENT' }] });
    ratings.find.mockResolvedValue([{ id: 1, rating: 5 }, { id: 2, rating: 4 }]);
    expect(await service.summary(7, owner)).toEqual({ tenantId: 7, average: 4.5, count: 2 });
  });
});
