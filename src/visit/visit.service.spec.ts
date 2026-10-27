import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppRole, ROLES_KEY } from '../auth/access';
import { Visit } from './entities/visit.entity';
import { VisitController } from './visit.controller';
import { VisitService } from './visit.service';
import { VisitStatus } from './visit-status.enum';
import { effectiveStatus, isLive, toVisitView } from './visit-views';

const NOW = new Date('2026-11-16T15:00:00Z');
const HOUR = 3_600_000;

const visit = (overrides: Partial<Visit> = {}): Visit => ({
  id: 1, propertyId: 5, tenantId: 7, ownerId: 2, status: VisitStatus.PENDING,
  scheduledAt: new Date(NOW.getTime() + 24 * HOUR), expiresAt: new Date(NOW.getTime() + 10 * HOUR),
  createdAt: new Date(NOW.getTime() - HOUR), timezone: 'America/Costa_Rica', ...overrides,
} as Visit);

describe('VisitService state changes', () => {
  function setup(found: Visit | null, affected = 1) {
    const execute = jest.fn().mockResolvedValue({ affected });
    const where = jest.fn().mockReturnValue({ execute });
    const set = jest.fn().mockReturnValue({ where });
    const update = jest.fn().mockReturnValue({ set });
    const builder = { getOne: jest.fn().mockResolvedValue(found && { ...found, property: { id: 5, title: 'Casa', address: 'X', status: 'ACTIVE', reservedTenantId: null }, tenant: { id: 7, name: 'Ana', surname1: 'P' }, owner: { id: 2, name: 'Pedro', surname1: 'D' } }) };
    builder['where'] = jest.fn().mockReturnValue(builder);
    builder['innerJoin'] = jest.fn().mockReturnValue(builder);
    builder['select'] = jest.fn().mockReturnValue(builder);
    const dataSource = {
      getRepository: (entity: unknown) => entity === Visit ? { findOneBy: jest.fn().mockResolvedValue(found), createQueryBuilder: () => builder } : {},
      createQueryBuilder: () => ({ update }),
    } as unknown as DataSource;
    return { service: new VisitService(dataSource), set, where };
  }

  describe('confirm', () => {
    it('confirms a pending request and clears the expiry', async () => {
      const { service, set } = setup(visit());
      await service.confirm(1, 2, NOW);
      expect(set).toHaveBeenCalledWith({ status: VisitStatus.CONFIRMED, confirmedAt: NOW, expiresAt: null });
    });

    it('only the property owner can confirm', async () => {
      const { service } = setup(visit());
      await expect(service.confirm(1, 99, NOW)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses a request nobody answered in time', async () => {
      const { service } = setup(visit({ expiresAt: new Date(NOW.getTime() - HOUR) }));
      await expect(service.confirm(1, 2, NOW)).rejects.toMatchObject({ response: { code: 'API_LA_SOLICITUD_YA_VENCIO' } });
    });

    it('refuses to confirm something that is not pending', async () => {
      const { service } = setup(visit({ status: VisitStatus.CANCELLED }));
      await expect(service.confirm(1, 2, NOW)).rejects.toMatchObject({ response: { code: 'API_EL_ESTADO_DE_LA_CITA_NO_PERMITE_ESTA_ACCION' } });
    });

    it('reports the conflict when someone else answered first (nothing updated)', async () => {
      const { service } = setup(visit(), 0);
      await expect(service.confirm(1, 2, NOW)).rejects.toBeInstanceOf(ConflictException);
    });

    it('does not find unknown visits', async () => {
      const { service } = setup(null);
      await expect(service.confirm(1, 2, NOW)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('accept (counter-proposal)', () => {
    it('lets the tenant accept the owner proposal', async () => {
      const { service, set } = setup(visit({ status: VisitStatus.COUNTER_PROPOSED }));
      await service.accept(1, 7, NOW);
      expect(set).toHaveBeenCalledWith({ status: VisitStatus.CONFIRMED, confirmedAt: NOW, expiresAt: null });
    });

    it('rejects another tenant and visits without a proposal', async () => {
      await expect(setup(visit({ status: VisitStatus.COUNTER_PROPOSED })).service.accept(1, 8, NOW)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(setup(visit()).service.accept(1, 7, NOW)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('cancel', () => {
    it('records who cancelled and why', async () => {
      const tenant = setup(visit());
      await tenant.service.cancel(1, 7, '  Ya no puedo  ', NOW);
      expect(tenant.set).toHaveBeenCalledWith({ status: VisitStatus.CANCELLED, cancelledBy: 'TENANT', cancelReason: 'Ya no puedo', expiresAt: null });

      const owner = setup(visit({ status: VisitStatus.CONFIRMED }));
      await owner.service.cancel(1, 2, undefined, NOW);
      expect(owner.set).toHaveBeenCalledWith({ status: VisitStatus.CANCELLED, cancelledBy: 'OWNER', cancelReason: null, expiresAt: null });
    });

    it('rejects people who are not part of the visit and visits that already happened', async () => {
      await expect(setup(visit()).service.cancel(1, 99, undefined, NOW)).rejects.toBeInstanceOf(ForbiddenException);
      const past = visit({ status: VisitStatus.CONFIRMED, scheduledAt: new Date(NOW.getTime() - HOUR), expiresAt: null });
      await expect(setup(past).service.cancel(1, 7, undefined, NOW)).rejects.toMatchObject({ response: { code: 'API_EL_HORARIO_DE_LA_CITA_YA_PASO' } });
    });
  });
});

describe('Visit views', () => {
  it('shows a request nobody answered in time as expired, without touching confirmed visits', () => {
    expect(effectiveStatus(visit({ expiresAt: new Date(NOW.getTime() - 1) }), NOW)).toBe(VisitStatus.EXPIRED);
    expect(effectiveStatus(visit(), NOW)).toBe(VisitStatus.PENDING);
    expect(effectiveStatus(visit({ status: VisitStatus.CONFIRMED, expiresAt: null }), NOW)).toBe(VisitStatus.CONFIRMED);
  });

  it('keeps only upcoming confirmed visits and waiting requests as live', () => {
    expect(isLive(visit(), NOW)).toBe(true);
    expect(isLive(visit({ status: VisitStatus.CONFIRMED, expiresAt: null }), NOW)).toBe(true);
    expect(isLive(visit({ status: VisitStatus.CONFIRMED, expiresAt: null, scheduledAt: new Date(NOW.getTime() - HOUR) }), NOW)).toBe(false);
    expect(isLive(visit({ status: VisitStatus.CANCELLED }), NOW)).toBe(false);
  });

  it('never exposes email, phone or id card of the people', () => {
    const view = toVisitView({
      ...visit(),
      property: { id: 5, title: 'Casa', address: 'X', status: 'ACTIVE', reservedTenantId: 7 },
      tenant: { id: 7, name: 'Ana', surname1: 'P', surname2: null, email: 'secreto@x.com', phoneNumber: '8888', idCard: '1-111' },
      owner: { id: 2, name: 'Pedro', surname1: 'D', email: 'otro@x.com' },
    } as unknown as Visit, NOW);
    expect(JSON.stringify(view)).not.toMatch(/secreto|otro@|8888|1-111/);
    expect(view.property).toMatchObject({ reserved: true, reservedForTenant: true });
  });
});

describe('VisitController', () => {
  const roles = (method: keyof VisitController) => Reflect.getMetadata(ROLES_KEY, VisitController.prototype[method]);

  it('limits every action to the right role', () => {
    expect(roles('request')).toEqual([AppRole.CLIENT]);
    expect(roles('mine')).toEqual([AppRole.CLIENT]);
    expect(roles('accept')).toEqual([AppRole.CLIENT]);
    for (const method of ['received', 'confirm', 'propose', 'availability', 'setAvailability'] as const) expect(roles(method)).toEqual([AppRole.OWNER]);
    expect(roles('summary')).toEqual([AppRole.CLIENT, AppRole.OWNER]);
    expect(roles('cancel')).toEqual([AppRole.CLIENT, AppRole.OWNER]);
  });

  it('always acts on the token user, never on an id sent by the client', async () => {
    const visits = { request: jest.fn(), confirm: jest.fn(), cancel: jest.fn(), accept: jest.fn(), propose: jest.fn() };
    const controller = new VisitController(visits as never);
    const req = { user: { id: 7 } } as never;
    await controller.request({ propertyId: 5, scheduledAt: 'x' }, req);
    await controller.confirm(1, req);
    await controller.accept(1, req);
    await controller.cancel(1, { reason: 'r' }, req);
    await controller.propose(1, { scheduledAt: 'y' }, req);
    expect(visits.request).toHaveBeenCalledWith(7, { propertyId: 5, scheduledAt: 'x' });
    expect(visits.confirm).toHaveBeenCalledWith(1, 7);
    expect(visits.accept).toHaveBeenCalledWith(1, 7);
    expect(visits.cancel).toHaveBeenCalledWith(1, 7, 'r');
    expect(visits.propose).toHaveBeenCalledWith(1, 7, 'y');
  });
});
