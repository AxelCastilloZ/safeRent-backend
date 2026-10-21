import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AppRole, ROLES_KEY } from '../auth/access';
import { Property } from '../property/entities/property.entity';
import { PropertyStatus } from '../property/property-status.enum';
import { SavedProperty } from './entities/saved-property.entity';
import { SavedPropertyController } from './saved-property.controller';
import { SavedPropertyService } from './saved-property.service';

describe('SavedPropertyService', () => {
  const tenantId = 7;
  const activeProperty = { id: 5, ownerId: 2, status: PropertyStatus.ACTIVE };

  // Constructor de consultas encadenable: cada método devuelve el mismo objeto y el último resuelve el resultado.
  const qb: Record<string, jest.Mock> = {};
  for (const method of ['innerJoin', 'select', 'where', 'andWhere', 'orderBy', 'addOrderBy', 'delete', 'from', 'insert', 'into', 'values', 'orIgnore']) {
    qb[method] = jest.fn(() => qb);
  }
  qb.getRawMany = jest.fn();
  qb.execute = jest.fn();
  const savedRepo = { createQueryBuilder: jest.fn(() => qb), find: jest.fn() };
  const propertyRepo = { findOneBy: jest.fn(), find: jest.fn() };
  let service: SavedPropertyService;

  beforeEach(async () => {
    jest.clearAllMocks();
    qb.execute.mockResolvedValue({ affected: 1 });
    const module = await Test.createTestingModule({
      providers: [
        SavedPropertyService,
        { provide: getRepositoryToken(SavedProperty), useValue: savedRepo },
        { provide: getRepositoryToken(Property), useValue: propertyRepo },
      ],
    }).compile();
    service = module.get(SavedPropertyService);
  });

  describe('save', () => {
    it('saves an active property of someone else, ignoring duplicates', async () => {
      propertyRepo.findOneBy.mockResolvedValue(activeProperty);

      await expect(service.save(tenantId, 5)).resolves.toEqual({ propertyId: 5, saved: true });
      expect(qb.values).toHaveBeenCalledWith([{ user: { id: tenantId }, property: { id: 5 } }]);
      expect(qb.orIgnore).toHaveBeenCalled(); // guardar dos veces no duplica ni falla
    });

    it('rejects properties that do not exist or are not active', async () => {
      propertyRepo.findOneBy.mockResolvedValue(null);
      await expect(service.save(tenantId, 99)).rejects.toBeInstanceOf(NotFoundException);

      propertyRepo.findOneBy.mockResolvedValue({ ...activeProperty, status: PropertyStatus.PENDING });
      await expect(service.save(tenantId, 5)).rejects.toBeInstanceOf(NotFoundException);
      expect(qb.insert).not.toHaveBeenCalled();
    });

    it('does not let you save your own property', async () => {
      propertyRepo.findOneBy.mockResolvedValue({ ...activeProperty, ownerId: tenantId });

      await expect(service.save(tenantId, 5)).rejects.toBeInstanceOf(BadRequestException);
      expect(qb.insert).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('removes only the pair user–property, and does not fail when it was not saved', async () => {
      await expect(service.remove(tenantId, 5)).resolves.toEqual({ propertyId: 5, removed: true });
      expect(qb.where).toHaveBeenCalledWith('"userId" = :userId', { userId: tenantId });
      expect(qb.andWhere).toHaveBeenCalledWith('"propertyId" = :propertyId', { propertyId: 5 });

      qb.execute.mockResolvedValue({ affected: 0 });
      await expect(service.remove(tenantId, 5)).resolves.toEqual({ propertyId: 5, removed: false });
    });
  });

  describe('listIds', () => {
    it('returns numeric ids, newest first', async () => {
      qb.getRawMany.mockResolvedValue([{ propertyId: '9' }, { propertyId: 5 }]);

      await expect(service.listIds(tenantId)).resolves.toEqual([9, 5]);
      expect(qb.where).toHaveBeenCalledWith('saved.user = :userId', { userId: tenantId });
      expect(qb.orderBy).toHaveBeenCalledWith('saved.createdAt', 'DESC');
    });
  });

  describe('list', () => {
    it('shows card data, flags unavailable ones, and never exposes who reserved or the owner contact', async () => {
      const savedAt = new Date('2026-10-21T10:00:00Z');
      const base = {
        title: 'Casa', description: 'd', address: 'Nicoya', cost: '100', typeOfCoin: 'CRC', rooms: 2, guest: 3,
        typeOfProperty: null, services: [], files: [{ path: 'uploads/a.jpg', mimeType: 'image/jpeg', size: 1, uploadedBy: 'x' }],
        owner: { id: 2, name: 'Pedro', email: 'secreto@example.com', idCard: '1-111' },
      };
      savedRepo.find.mockResolvedValue([
        { createdAt: savedAt, property: { ...base, id: 5, status: PropertyStatus.ACTIVE, reservedTenantId: 11 } },
        { createdAt: savedAt, property: { ...base, id: 6, status: PropertyStatus.INACTIVE, reservedTenantId: null } },
      ]);

      const [first, second] = await service.list(tenantId);

      expect(first).toMatchObject({ id: 5, available: true, reserved: true, savedAt, owner: { id: 2, name: 'Pedro' } });
      expect(first.files).toEqual([{ path: 'uploads/a.jpg', mimeType: 'image/jpeg' }]);
      expect(second).toMatchObject({ id: 6, available: false, reserved: false });
      // Nada de la persona que reservó ni datos privados del propietario.
      expect(first).not.toHaveProperty('reservedTenantId');
      expect(JSON.stringify(first)).not.toContain('secreto@example.com');
      expect(JSON.stringify(first)).not.toContain('1-111');
      expect(savedRepo.find).toHaveBeenCalledWith(expect.objectContaining({ where: { user: { id: tenantId } } }));
    });
  });

  describe('importMany', () => {
    it('imports only active properties of others and reports what it skipped', async () => {
      propertyRepo.find.mockResolvedValue([
        { id: 5, ownerId: 2 },
        { id: 6, ownerId: tenantId }, // propia
      ]);

      // 5, 6 y 7 (no existe o no está activa) más un 5 repetido
      await expect(service.importMany(tenantId, [5, 6, 7, 5])).resolves.toEqual({ saved: 1, skipped: 2 });
      expect(qb.values).toHaveBeenCalledWith([{ user: { id: tenantId }, property: { id: 5 } }]);
    });

    it('does nothing for an empty list', async () => {
      await expect(service.importMany(tenantId, [])).resolves.toEqual({ saved: 0, skipped: 0 });
      expect(propertyRepo.find).not.toHaveBeenCalled();
      expect(qb.insert).not.toHaveBeenCalled();
    });
  });
});

describe('SavedPropertyController', () => {
  const saved = { list: jest.fn(), listIds: jest.fn(), save: jest.fn(), remove: jest.fn(), importMany: jest.fn() };
  const pricing = { prepare: jest.fn(), decorate: jest.fn() };
  const controller = new SavedPropertyController(saved as never, pricing as never);
  const req = { user: { id: 7 } } as never;

  beforeEach(() => jest.clearAllMocks());

  it('is only for tenants', () => {
    expect(Reflect.getMetadata(ROLES_KEY, SavedPropertyController)).toEqual([AppRole.CLIENT]);
  });

  it('always acts on the token user, never on an id sent by the client', async () => {
    await controller.save(5, req);
    await controller.remove(5, req);
    await controller.ids(req);
    await controller.importMany(req, { propertyIds: [5, 6] });

    expect(saved.save).toHaveBeenCalledWith(7, 5);
    expect(saved.remove).toHaveBeenCalledWith(7, 5);
    expect(saved.listIds).toHaveBeenCalledWith(7);
    expect(saved.importMany).toHaveBeenCalledWith(7, [5, 6]);
  });

  it('shows prices in the currency the user asked for', async () => {
    const items = [{ id: 5, cost: '100', typeOfCoin: 'CRC' }];
    const context = { currency: 'USD', snapshot: null };
    saved.list.mockResolvedValue(items);
    pricing.prepare.mockResolvedValue(context);
    pricing.decorate.mockResolvedValue([{ ...items[0], displayPrice: { amount: '0.2' } }]);

    const result = await controller.list(req, { displayCurrency: 'USD' });

    expect(saved.list).toHaveBeenCalledWith(7);
    expect(pricing.prepare).toHaveBeenCalledWith({ displayCurrency: 'USD' });
    expect(pricing.decorate).toHaveBeenCalledWith(items, context);
    expect(result[0]).toMatchObject({ id: 5, displayPrice: { amount: '0.2' } });
  });
});
