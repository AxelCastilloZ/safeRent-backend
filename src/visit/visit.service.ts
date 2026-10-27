import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Property } from '../property/entities/property.entity';
import { PropertyStatus } from '../property/property-status.enum';
import { CreateVisitDto, SetAvailabilityDto, SlotsQueryDto } from './dto/visit.dto';
import { PropertyAvailability } from './entities/property-availability.entity';
import { Visit } from './entities/visit.entity';
import { EXPIRING_STATUSES, VisitStatus } from './visit-status.enum';
import { HOLD_HOURS, MAX_DAYS_AHEAD, MAX_PENDING_PER_PROPERTY, MAX_RANGE_DAYS, MIN_LEAD_MINUTES, SLOT_MINUTES } from './visit.constants';
import {
  addDays, AvailabilityRule, DEFAULT_RULES, DEFAULT_TIMEZONE, isDateKey, isOfferedSlot, isValidTimezone, listSlots,
} from './visit-slots';
import { VisitNotificationService } from './visit-notification.service';
import { effectiveStatus, isLive, toVisitView } from './visit-views';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// Errores con código: el frontend los traduce a los cuatro idiomas (api.json).
const errors = {
  notFound: () => new NotFoundException({ code: 'API_CITA_NO_ENCONTRADA', message: 'Cita no encontrada', params: {} }),
  propertyUnavailable: () => new NotFoundException({ code: 'API_PROPIEDAD_NO_DISPONIBLE_PARA_CITAS', message: 'La propiedad no está disponible para agendar citas', params: {} }),
  ownProperty: () => new BadRequestException({ code: 'API_NO_PUEDES_AGENDAR_UNA_CITA_EN_TU_PROPIEDAD', message: 'No puedes agendar una cita en tu propia propiedad', params: {} }),
  alreadyReserved: () => new ConflictException({ code: 'API_LA_PROPIEDAD_YA_ESTA_RESERVADA', message: 'La propiedad ya está reservada', params: {} }),
  invalidSlot: () => new BadRequestException({ code: 'API_HORARIO_NO_VALIDO', message: 'El horario elegido no está disponible para esta propiedad', params: {} }),
  tooSoon: () => new BadRequestException({ code: 'API_HORARIO_DEMASIADO_PROXIMO', message: 'Elige un horario con más anticipación', params: { minutes: MIN_LEAD_MINUTES } }),
  slotTaken: () => new ConflictException({ code: 'API_HORARIO_NO_DISPONIBLE', message: 'Ese horario ya fue tomado. Elige otro.', params: {} }),
  ownerBusy: () => new ConflictException({ code: 'API_YA_TIENES_UNA_CITA_CONFIRMADA_EN_ESE_HORARIO', message: 'Ya tienes otra cita confirmada en ese horario', params: {} }),
  alreadyActive: () => new ConflictException({ code: 'API_YA_TIENES_UNA_CITA_ACTIVA_EN_ESTA_PROPIEDAD', message: 'Ya tienes una cita activa en esta propiedad', params: {} }),
  queueFull: () => new ConflictException({ code: 'API_EL_PROPIETARIO_TIENE_DEMASIADAS_SOLICITUDES', message: 'El propietario tiene demasiadas solicitudes pendientes. Intenta más tarde.', params: { max: MAX_PENDING_PER_PROPERTY } }),
  expired: () => new ConflictException({ code: 'API_LA_SOLICITUD_YA_VENCIO', message: 'La solicitud ya venció', params: {} }),
  wrongState: () => new ConflictException({ code: 'API_EL_ESTADO_DE_LA_CITA_NO_PERMITE_ESTA_ACCION', message: 'El estado de la cita no permite esta acción', params: {} }),
  past: () => new BadRequestException({ code: 'API_EL_HORARIO_DE_LA_CITA_YA_PASO', message: 'El horario de la cita ya pasó', params: {} }),
  onlyOwner: () => new ForbiddenException({ code: 'API_SOLO_EL_PROPIETARIO_PUEDE_GESTIONAR_LA_CITA', message: 'Solo el propietario puede gestionar esta cita', params: {} }),
  onlyTenant: () => new ForbiddenException({ code: 'API_SOLO_EL_INQUILINO_PUEDE_RESPONDER_LA_CONTRAPROPUESTA', message: 'Solo el inquilino puede responder la contrapropuesta', params: {} }),
  notParticipant: () => new ForbiddenException({ code: 'API_NO_PARTICIPAS_EN_ESTA_CITA', message: 'No participas en esta cita', params: {} }),
  invalidRange: () => new BadRequestException({ code: 'API_RANGO_DE_FECHAS_INVALIDO', message: 'El rango de fechas no es válido', params: { max: MAX_RANGE_DAYS } }),
  invalidTimezone: () => new BadRequestException({ code: 'API_ZONA_HORARIA_INVALIDA', message: 'La zona horaria no es válida', params: {} }),
  invalidAvailability: () => new BadRequestException({ code: 'API_DISPONIBILIDAD_INVALIDA', message: 'Las ventanas de atención no son válidas', params: {} }),
  onlyPropertyOwner: () => new ForbiddenException({ code: 'API_SOLO_EL_PROPIETARIO_PUEDE_CONFIGURAR_LA_DISPONIBILIDAD', message: 'Solo el propietario puede configurar la disponibilidad', params: {} }),
};

type Reader = EntityManager | DataSource;
type Constraint = { driverError?: { code?: string; constraint?: string } };

/** Convierte un choque con los índices únicos (dos personas pidiendo a la vez) en el error de negocio que corresponde. */
function translateConflict(error: unknown): never {
  const { code, constraint } = (error as Constraint).driverError ?? {};
  if (code === '23505' && constraint === 'uq_visit_owner_confirmed_slot') throw errors.ownerBusy();
  if (code === '23505') throw errors.slotTaken();
  throw error;
}

@Injectable()
export class VisitService {
  constructor(
    private readonly dataSource: DataSource,
    // Opcional: sin él las citas funcionan igual, solo que sin correos (pruebas y scripts).
    @Optional() private readonly notifier?: VisitNotificationService,
  ) {}

  // ---------- Disponibilidad del propietario ----------

  private async availabilityOf(reader: Reader, propertyId: number) {
    const row = await reader.getRepository(PropertyAvailability).findOneBy({ propertyId });
    return row
      ? { timezone: row.timezone, rules: row.rules, isDefault: false }
      : { timezone: DEFAULT_TIMEZONE, rules: DEFAULT_RULES, isDefault: true };
  }

  private async basicProperty(reader: Reader, propertyId: number, lock = false) {
    const query = reader.getRepository(Property).createQueryBuilder('property')
      .select(['property.id', 'property.title', 'property.status', 'property.ownerId', 'property.reservedTenantId'])
      .where('property.id = :propertyId', { propertyId });
    if (lock) query.setLock('pessimistic_write');
    return query.getOne();
  }

  async getAvailability(propertyId: number, ownerId: number) {
    const [property, availability] = await Promise.all([this.basicProperty(this.dataSource, propertyId), this.availabilityOf(this.dataSource, propertyId)]);
    if (!property) throw errors.propertyUnavailable();
    if (property.ownerId !== ownerId) throw errors.onlyPropertyOwner();
    return { ...availability, slotMinutes: SLOT_MINUTES };
  }

  async setAvailability(propertyId: number, ownerId: number, dto: SetAvailabilityDto) {
    if (!isValidTimezone(dto.timezone)) throw errors.invalidTimezone();
    const rules: AvailabilityRule[] = dto.rules.map(({ weekday, start, end }) => ({ weekday, start, end }));
    this.assertValidRules(rules);
    const property = await this.basicProperty(this.dataSource, propertyId);
    if (!property) throw errors.propertyUnavailable();
    if (property.ownerId !== ownerId) throw errors.onlyPropertyOwner();

    await this.dataSource.getRepository(PropertyAvailability).upsert({ propertyId, timezone: dto.timezone, rules }, ['propertyId']);
    return { timezone: dto.timezone, rules, isDefault: false, slotMinutes: SLOT_MINUTES };
  }

  /** Cada ventana debe terminar después de empezar y no solaparse con otra del mismo día. */
  private assertValidRules(rules: AvailabilityRule[]) {
    for (const weekday of new Set(rules.map((rule) => rule.weekday))) {
      const windows = rules.filter((rule) => rule.weekday === weekday).sort((a, b) => a.start.localeCompare(b.start));
      if (windows.length > 4) throw errors.invalidAvailability();
      windows.forEach((window, index) => {
        if (window.start >= window.end) throw errors.invalidAvailability();
        if (index > 0 && windows[index - 1].end > window.start) throw errors.invalidAvailability();
      });
    }
  }

  // ---------- Calendario ----------

  /** Horarios de una propiedad en un rango de fechas, con cuáles siguen libres. Es una sola ida y vuelta a la base. */
  async slots(propertyId: number, query: SlotsQueryDto, now = new Date()) {
    const { from, to } = query;
    const span = isDateKey(from) && isDateKey(to) ? (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY : -1;
    if (span < 0 || span > MAX_RANGE_DAYS) throw errors.invalidRange();

    // El rango se amplía un día por cada lado para no depender de la zona horaria al buscar horarios ocupados.
    const rangeStart = new Date(`${addDays(from, -1)}T00:00:00Z`);
    const rangeEnd = new Date(`${addDays(to, 2)}T00:00:00Z`);
    const [property, availability, held] = await Promise.all([
      this.basicProperty(this.dataSource, propertyId),
      this.availabilityOf(this.dataSource, propertyId),
      this.dataSource.getRepository(Visit).createQueryBuilder('visit')
        .select(['visit.scheduledAt'])
        .where('visit.propertyId = :propertyId', { propertyId })
        .andWhere('visit.scheduledAt >= :rangeStart AND visit.scheduledAt < :rangeEnd', { rangeStart, rangeEnd })
        .andWhere(`(visit.status = :confirmed OR (visit.status IN (:...waiting) AND visit.expiresAt > :now))`, {
          confirmed: VisitStatus.CONFIRMED, waiting: EXPIRING_STATUSES, now,
        })
        .getMany(),
    ]);
    if (!property || property.status !== PropertyStatus.ACTIVE) throw errors.propertyUnavailable();

    return {
      timezone: availability.timezone,
      slotMinutes: SLOT_MINUTES,
      propertyReserved: Boolean(property.reservedTenantId),
      slots: listSlots({
        from, to, rules: availability.rules, timezone: availability.timezone, now,
        occupied: new Set(held.map((visit) => visit.scheduledAt.getTime())),
      }),
    };
  }

  // ---------- Pedir una cita ----------

  async request(tenantId: number, dto: CreateVisitDto, now = new Date()) {
    const scheduledAt = new Date(dto.scheduledAt);
    const { id, notifyOwnerNow } = await this.dataSource.transaction(async (manager) => {
      // Se bloquea la fila de la propiedad: dos solicitudes a la vez se procesan una tras otra, y gana la primera.
      const property = await this.basicProperty(manager, dto.propertyId, true);
      if (!property || property.status !== PropertyStatus.ACTIVE) throw errors.propertyUnavailable();
      if (property.ownerId === tenantId) throw errors.ownProperty();
      if (property.reservedTenantId) throw errors.alreadyReserved();

      const availability = await this.availabilityOf(manager, property.id);
      this.assertBookable(scheduledAt, availability, now);

      await this.releaseStaleHolds(manager, property.id, now);
      const [counts] = await manager.query<{ pending: number; mine: number; taken: number; ownerPending: number }[]>(
        `SELECT
           (SELECT count(*)::int FROM visit WHERE "propertyId" = $1 AND status = 'PENDING') AS pending,
           (SELECT count(*)::int FROM visit WHERE "propertyId" = $1 AND "tenantId" = $2
              AND (status IN ('PENDING', 'COUNTER_PROPOSED') OR (status = 'CONFIRMED' AND "scheduledAt" > $3))) AS mine,
           (SELECT count(*)::int FROM visit WHERE "propertyId" = $1 AND "scheduledAt" = $4
              AND status IN ('PENDING', 'COUNTER_PROPOSED', 'CONFIRMED')) AS taken,
           (SELECT count(*)::int FROM visit WHERE "ownerId" = $5 AND status = 'PENDING' AND "expiresAt" > $3) AS "ownerPending"`,
        [property.id, tenantId, now, scheduledAt, property.ownerId],
      );
      if (counts.mine > 0) throw errors.alreadyActive();
      if (counts.taken > 0) throw errors.slotTaken();
      if (counts.pending >= MAX_PENDING_PER_PROPERTY) throw errors.queueFull();

      const visits = manager.getRepository(Visit);
      try {
        const saved = await visits.save(visits.create({
          propertyId: property.id,
          tenantId,
          ownerId: property.ownerId,
          scheduledAt,
          status: VisitStatus.PENDING,
          note: dto.note?.trim() || null,
          timezone: availability.timezone,
          expiresAt: new Date(now.getTime() + HOLD_HOURS * HOUR),
          // Si el propietario no tenía nada pendiente (en ninguna de sus propiedades), esta solicitud se le avisa de
          // inmediato; las siguientes van juntas en el resumen para no llenarle el correo.
          ownerNotifiedAt: counts.ownerPending === 0 ? now : null,
        }));
        return { id: saved.id, notifyOwnerNow: counts.ownerPending === 0 };
      } catch (error) {
        return translateConflict(error);
      }
    });
    if (notifyOwnerNow) void this.notifier?.notify(id, 'REQUESTED');
    return this.loadView(id, now);
  }

  private assertBookable(scheduledAt: Date, availability: { timezone: string; rules: AvailabilityRule[] }, now: Date) {
    const time = scheduledAt.getTime();
    if (Number.isNaN(time)) throw errors.invalidSlot();
    if (time < now.getTime() + MIN_LEAD_MINUTES * 60_000) throw errors.tooSoon();
    if (time > now.getTime() + MAX_DAYS_AHEAD * DAY) throw errors.invalidSlot();
    if (!isOfferedSlot(scheduledAt, availability.rules, availability.timezone)) throw errors.invalidSlot();
  }

  /** Las solicitudes que nadie respondió a tiempo dejan de retener su horario. */
  private async releaseStaleHolds(manager: EntityManager, propertyId: number, now: Date) {
    await manager.createQueryBuilder().update(Visit)
      .set({ status: VisitStatus.EXPIRED })
      .where('"propertyId" = :propertyId AND "status" IN (:...waiting) AND "expiresAt" <= :now', { propertyId, waiting: EXPIRING_STATUSES, now })
      .execute();
  }

  // ---------- Responder ----------

  /** Cambia el estado solo si la cita sigue como la leímos (compare-and-set): dos respuestas a la vez no se pisan. */
  private async transition(id: number, from: VisitStatus[], patch: Partial<Visit>, now: Date, manager: Reader = this.dataSource) {
    const result = await manager.createQueryBuilder().update(Visit)
      .set(patch)
      .where('id = :id AND "status" IN (:...from) AND ("expiresAt" IS NULL OR "expiresAt" > :now)', { id, from, now })
      .execute();
    return (result.affected ?? 0) > 0;
  }

  private assertCanAct(visit: Visit, allowed: VisitStatus[], now: Date) {
    const status = effectiveStatus(visit, now);
    if (status === VisitStatus.EXPIRED) throw errors.expired();
    if (!allowed.includes(status)) throw errors.wrongState();
  }

  async confirm(id: number, ownerId: number, now = new Date()) {
    const visit = await this.dataSource.getRepository(Visit).findOneBy({ id });
    if (!visit) throw errors.notFound();
    if (visit.ownerId !== ownerId) throw errors.onlyOwner();
    this.assertCanAct(visit, [VisitStatus.PENDING], now);
    if (visit.scheduledAt.getTime() <= now.getTime()) throw errors.past();

    try {
      const changed = await this.transition(id, [VisitStatus.PENDING], { status: VisitStatus.CONFIRMED, confirmedAt: now, expiresAt: null }, now);
      if (!changed) throw errors.wrongState();
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      translateConflict(error);
    }
    void this.notifier?.notify(id, 'CONFIRMED');
    return this.loadView(id, now);
  }

  /** El propietario propone otro horario: el nuevo queda retenido y el inquilino decide. */
  async propose(id: number, ownerId: number, scheduledAtIso: string, now = new Date()) {
    const scheduledAt = new Date(scheduledAtIso);
    const visit = await this.dataSource.getRepository(Visit).findOneBy({ id });
    if (!visit) throw errors.notFound();
    if (visit.ownerId !== ownerId) throw errors.onlyOwner();
    this.assertCanAct(visit, [VisitStatus.PENDING], now);

    await this.dataSource.transaction(async (manager) => {
      await this.basicProperty(manager, visit.propertyId, true);
      const availability = await this.availabilityOf(manager, visit.propertyId);
      this.assertBookable(scheduledAt, availability, now);
      if (scheduledAt.getTime() === visit.scheduledAt.getTime()) throw errors.invalidSlot();

      await this.releaseStaleHolds(manager, visit.propertyId, now);
      const [taken] = await manager.query<{ count: number }[]>(
        `SELECT count(*)::int AS count FROM visit WHERE "propertyId" = $1 AND "scheduledAt" = $2 AND id <> $3
           AND status IN ('PENDING', 'COUNTER_PROPOSED', 'CONFIRMED')`,
        [visit.propertyId, scheduledAt, id],
      );
      if (taken.count > 0) throw errors.slotTaken();

      try {
        const changed = await this.transition(id, [VisitStatus.PENDING], {
          status: VisitStatus.COUNTER_PROPOSED,
          previousScheduledAt: visit.scheduledAt,
          scheduledAt,
          expiresAt: new Date(now.getTime() + HOLD_HOURS * HOUR),
        }, now, manager);
        if (!changed) throw errors.wrongState();
      } catch (error) {
        if (error instanceof ConflictException) throw error;
        translateConflict(error);
      }
    });
    void this.notifier?.notify(id, 'PROPOSED');
    return this.loadView(id, now);
  }

  /** El inquilino acepta el horario que propuso el propietario. */
  async accept(id: number, tenantId: number, now = new Date()) {
    const visit = await this.dataSource.getRepository(Visit).findOneBy({ id });
    if (!visit) throw errors.notFound();
    if (visit.tenantId !== tenantId) throw errors.onlyTenant();
    this.assertCanAct(visit, [VisitStatus.COUNTER_PROPOSED], now);
    if (visit.scheduledAt.getTime() <= now.getTime()) throw errors.past();

    try {
      const changed = await this.transition(id, [VisitStatus.COUNTER_PROPOSED], { status: VisitStatus.CONFIRMED, confirmedAt: now, expiresAt: null }, now);
      if (!changed) throw errors.wrongState();
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      translateConflict(error);
    }
    void this.notifier?.notify(id, 'ACCEPTED');
    return this.loadView(id, now);
  }

  async cancel(id: number, userId: number, reason: string | undefined, now = new Date()) {
    const visit = await this.dataSource.getRepository(Visit).findOneBy({ id });
    if (!visit) throw errors.notFound();
    const cancelledBy = visit.ownerId === userId ? 'OWNER' : visit.tenantId === userId ? 'TENANT' : null;
    if (!cancelledBy) throw errors.notParticipant();
    this.assertCanAct(visit, [VisitStatus.PENDING, VisitStatus.COUNTER_PROPOSED, VisitStatus.CONFIRMED], now);
    if (visit.status === VisitStatus.CONFIRMED && visit.scheduledAt.getTime() <= now.getTime()) throw errors.past();

    const changed = await this.transition(
      id,
      [VisitStatus.PENDING, VisitStatus.COUNTER_PROPOSED, VisitStatus.CONFIRMED],
      { status: VisitStatus.CANCELLED, cancelledBy, cancelReason: reason?.trim() || null, expiresAt: null },
      now,
    );
    if (!changed) throw errors.wrongState();
    void this.notifier?.notify(id, cancelledBy === 'OWNER' ? 'CANCELLED_BY_OWNER' : 'CANCELLED_BY_TENANT');
    return this.loadView(id, now);
  }

  // ---------- Consultas ----------

  private viewQuery(reader: Reader = this.dataSource) {
    return reader.getRepository(Visit).createQueryBuilder('visit')
      .innerJoin('visit.property', 'property')
      .innerJoin('visit.tenant', 'tenant')
      .innerJoin('visit.owner', 'owner')
      .select([
        'visit',
        'property.id', 'property.title', 'property.address', 'property.status', 'property.reservedTenantId',
        'tenant.id', 'tenant.name', 'tenant.surname1', 'tenant.surname2',
        'owner.id', 'owner.name', 'owner.surname1',
      ]);
  }

  async loadView(id: number, now = new Date()) {
    const visit = await this.viewQuery().where('visit.id = :id', { id }).getOne();
    if (!visit) throw errors.notFound();
    return toVisitView(visit, now);
  }

  /** Citas del inquilino: las vivas primero (la más próxima arriba) y después el historial. */
  async listMine(tenantId: number, now = new Date()) {
    const visits = await this.viewQuery().where('visit.tenantId = :tenantId', { tenantId }).orderBy('visit.createdAt', 'DESC').limit(200).getMany();
    const live = visits.filter((visit) => isLive(visit, now)).sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
    const history = visits.filter((visit) => !isLive(visit, now));
    return [...live, ...history].map((visit) => toVisitView(visit, now));
  }

  /**
   * Citas recibidas por el propietario. Las solicitudes pendientes van primero y en el orden en que llegaron
   * (la más antigua arriba): así se sabe quién pidió primero. Luego las demás vivas por fecha y el historial.
   */
  async listReceived(ownerId: number, now = new Date()) {
    const visits = await this.viewQuery().where('visit.ownerId = :ownerId', { ownerId }).orderBy('visit.createdAt', 'DESC').limit(300).getMany();
    const queue = visits.filter((visit) => effectiveStatus(visit, now) === VisitStatus.PENDING).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const others = visits
      .filter((visit) => isLive(visit, now) && effectiveStatus(visit, now) !== VisitStatus.PENDING)
      .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
    const history = visits.filter((visit) => !isLive(visit, now));
    return [...queue, ...others, ...history].map((visit) => toVisitView(visit, now));
  }

  /**
   * Cifras para los contadores del menú y los inicios, en una sola consulta: lo que espera respuesta del propietario
   * y del inquilino, y las citas confirmadas que aún no llegan.
   */
  async summary(userId: number, now = new Date()) {
    const [row] = await this.dataSource.query<Record<string, number>[]>(
      `SELECT
         (SELECT count(*)::int FROM visit WHERE "ownerId" = $1 AND status = 'PENDING' AND "expiresAt" > $2) AS "ownerPending",
         (SELECT count(*)::int FROM visit WHERE "ownerId" = $1 AND status = 'CONFIRMED' AND "scheduledAt" > $2) AS "ownerUpcoming",
         (SELECT count(*)::int FROM visit WHERE "tenantId" = $1 AND status = 'COUNTER_PROPOSED' AND "expiresAt" > $2) AS "tenantNeedsAnswer",
         (SELECT count(*)::int FROM visit WHERE "tenantId" = $1
            AND ((status IN ('PENDING', 'COUNTER_PROPOSED') AND "expiresAt" > $2) OR (status = 'CONFIRMED' AND "scheduledAt" > $2))) AS "tenantUpcoming"`,
      [userId, now],
    );
    return {
      ownerPending: row.ownerPending, ownerUpcoming: row.ownerUpcoming,
      tenantNeedsAnswer: row.tenantNeedsAnswer, tenantUpcoming: row.tenantUpcoming,
    };
  }
}

