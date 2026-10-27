import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Conversation } from '../messages/conversation/entities/conversation.entity';
import { Property } from '../property/entities/property.entity';
import { PropertyStatus } from '../property/property-status.enum';
import { User } from '../user/entities/user.entity';
import { Visit } from '../visit/entities/visit.entity';
import { VisitNotificationService } from '../visit/visit-notification.service';
import { VisitStatus } from '../visit/visit-status.enum';
import { VisitService } from '../visit/visit.service';
import { ReservationNotificationService, type ReservationNotice } from './reservation-notification.service';

@Injectable()
export class ReservationService {
  constructor(
    private readonly dataSource: DataSource,
    // Opcionales: sin ellos reservar funciona igual, solo que no cancela las demás citas ni avisa (pruebas y scripts).
    @Optional() private readonly visits?: VisitService,
    @Optional() private readonly notifier?: VisitNotificationService,
    @Optional() private readonly reservationNotifier?: ReservationNotificationService,
  ) {}

  async release(propertyId: number, ownerId: number, reason: string) {
    if (!reason?.trim() || reason.trim().length > 500) throw new BadRequestException('El motivo debe tener entre 1 y 500 caracteres.');
    const { result, notice } = await this.dataSource.transaction(async (manager) => {
      const properties = manager.getRepository(Property);
      const property = await properties.createQueryBuilder('property')
        .where('property.id = :id', { id: propertyId })
        .setLock('pessimistic_write').getOne();
      if (!property) throw new NotFoundException({ code: "API_PROPIEDAD_NO_ENCONTRADA", message: 'Propiedad no encontrada', params: {  } });
      if (property.ownerId !== ownerId) throw new ForbiddenException({ code: "API_SOLO_EL_PROPIETARIO_PUEDE_QUITAR_LA_RESERVA", message: 'Solo el propietario puede quitar la reserva', params: {  } });
      // Captura al destinatario antes de eliminar la relación con el inquilino.
      const notice: ReservationNotice | null = property.reservedTenantId ? {
        propertyId: property.id, property: property.title, ownerId: property.ownerId,
        tenantId: property.reservedTenantId, reason: reason.trim(),
      } : null;
      property.reservedTenantId = null;
      property.reservedTenantName = null;
      property.reservedAt = null;
      property.reservedTenant = null;
      await properties.save(property);
      return { result: { propertyId: property.id, reservedTenantId: null, reservedTenantName: null, reservedAt: null }, notice };
    });
    if (notice) void this.reservationNotifier?.notify('RELEASED', notice);
    return result;
  }

  async reserve(conversationId: number, ownerId: number) {
    const { result, cancelled, notice } = await this.dataSource.transaction(async (manager) => {
      const conversation = await manager.getRepository(Conversation).findOne({
        where: { id: conversationId },
        relations: { participants: true, property: true },
      });
      if (!conversation?.property) throw new NotFoundException({ code: "API_CONVERSACION_NO_ENCONTRADA", message: 'Conversación no encontrada', params: {  } });
      const properties = manager.getRepository(Property);
      // Lock only the property row, not nullable joins, to serialize competing reservations.
      const property = await properties.createQueryBuilder('property')
        .where('property.id = :id', { id: conversation.property.id })
        .setLock('pessimistic_write').getOne();
      if (!property) throw new NotFoundException({ code: "API_PROPIEDAD_NO_ENCONTRADA", message: 'Propiedad no encontrada', params: {  } });
      if (property.ownerId !== ownerId ||
          !conversation.participants.some((user) => user.id === ownerId)) {
        throw new ForbiddenException({ code: "API_SOLO_EL_PROPIETARIO_PUEDE_ALQUILAR_ESTA_PROPIEDAD", message: 'Solo el propietario puede alquilar esta propiedad', params: {  } });
      }
      const tenants = conversation.participants.filter((user) => user.id !== ownerId);
      if (tenants.length !== 1) throw new BadRequestException({ code: "API_LA_CONVERSACION_DEBE_TENER_UN_UNICO_INQUILINO", message: 'La conversación debe tener un único inquilino', params: {  } });
      return this.assignTenant(manager, property, tenants[0].id);
    });
    this.tellCancelledVisits(cancelled);
    if (notice) void this.reservationNotifier?.notify('CONFIRMED', notice);
    return result;
  }

  /** Reserva la propiedad para el inquilino de una cita confirmada (el propietario sigue decidiendo: la cita solo le ahorra buscar la conversación). */
  async reserveFromVisit(visitId: number, ownerId: number) {
    const { result, cancelled, notice } = await this.dataSource.transaction(async (manager) => {
      const visit = await manager.getRepository(Visit).findOneBy({ id: visitId });
      if (!visit) throw new NotFoundException({ code: 'API_CITA_NO_ENCONTRADA', message: 'Cita no encontrada', params: {} });
      if (visit.ownerId !== ownerId) throw new ForbiddenException({ code: "API_SOLO_EL_PROPIETARIO_PUEDE_ALQUILAR_ESTA_PROPIEDAD", message: 'Solo el propietario puede alquilar esta propiedad', params: {  } });
      if (visit.status !== VisitStatus.CONFIRMED) throw new ConflictException({ code: 'API_LA_CITA_DEBE_ESTAR_CONFIRMADA_PARA_RESERVAR', message: 'La cita debe estar confirmada para reservar', params: {} });
      const property = await manager.getRepository(Property).createQueryBuilder('property')
        .where('property.id = :id', { id: visit.propertyId })
        .setLock('pessimistic_write').getOne();
      if (!property) throw new NotFoundException({ code: "API_PROPIEDAD_NO_ENCONTRADA", message: 'Propiedad no encontrada', params: {  } });
      if (property.ownerId !== ownerId) throw new ForbiddenException({ code: "API_SOLO_EL_PROPIETARIO_PUEDE_ALQUILAR_ESTA_PROPIEDAD", message: 'Solo el propietario puede alquilar esta propiedad', params: {  } });
      return this.assignTenant(manager, property, visit.tenantId);
    });
    this.tellCancelledVisits(cancelled);
    if (notice) void this.reservationNotifier?.notify('CONFIRMED', notice);
    return result;
  }

  private async assignTenant(manager: EntityManager, property: Property, tenantId: number) {
    const tenant = await manager.getRepository(User).findOneBy({ id: tenantId, isActive: true });
    if (!tenant) throw new BadRequestException({ code: "API_EL_INQUILINO_NO_ESTA_ACTIVO", message: 'El inquilino no está activo', params: {  } });
    if (property.status !== PropertyStatus.ACTIVE) throw new BadRequestException({ code: "API_SOLO_PUEDES_RESERVAR_UNA_PROPIEDAD_ACTIVA", message: 'Solo puedes reservar una propiedad activa', params: {  } });
    if (property.reservedTenantId && property.reservedTenantId !== tenant.id) {
      throw new ConflictException({ code: "API_LA_PROPIEDAD_YA_ESTA_RESERVADA_POR_OTRA_PERSONA", message: 'La propiedad ya está reservada por otra persona', params: {  } });
    }
    let cancelled: number[] = [];
    let notice: ReservationNotice | null = null;
    if (!property.reservedTenantId) {
      property.reservedTenantId = tenant.id;
      property.reservedTenantName = [tenant.name, tenant.surname1, tenant.surname2].filter(Boolean).join(' ');
      property.reservedAt = new Date();
      await manager.getRepository(Property).save(property);
      // Con la propiedad reservada, las citas de las demás personas dejan de tener sentido.
      cancelled = (await this.visits?.cancelForReservation(manager, property.id, tenant.id)) ?? [];
      notice = { propertyId: property.id, property: property.title, ownerId: property.ownerId, tenantId: tenant.id };
    }
    return {
      result: {
        propertyId: property.id,
        reservedTenantId: property.reservedTenantId,
        reservedTenantName: property.reservedTenantName,
        reservedAt: property.reservedAt,
      },
      cancelled,
      notice,
    };
  }

  /** Avisa por correo a quienes perdieron su cita (después de confirmar la reserva, sin hacerla esperar). */
  private tellCancelledVisits(ids: number[]) {
    for (const id of ids) void this.notifier?.notify(id, 'CANCELLED_PROPERTY_RESERVED');
  }
}
