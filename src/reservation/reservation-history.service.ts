import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import { Property } from '../property/entities/property.entity';
import { User } from '../user/entities/user.entity';
import { AppRole } from '../auth/access';
import { Reservation } from './entities/reservation.entity';

type Requester = { id: number; roles: string[] };

const fullName = (user?: User | null) => [user?.name, user?.surname1, user?.surname2].filter(Boolean).join(' ');

/** Lo que se muestra de una reserva del historial (sin datos privados de las personas). */
function toView(reservation: Reservation) {
  return {
    id: reservation.id,
    startedAt: reservation.startedAt,
    endedAt: reservation.endedAt ?? null,
    endReason: reservation.endReason ?? null,
    active: !reservation.endedAt,
    property: { id: reservation.propertyId, title: reservation.property?.title ?? '', address: reservation.property?.address ?? '' },
    tenant: { id: reservation.tenantId, name: fullName(reservation.tenant) },
    // Al propietario se le muestra solo el nombre, igual que en sus publicaciones.
    owner: { id: reservation.ownerId, name: reservation.owner?.name ?? '' },
  };
}

/** Abre la fila del historial cuando una propiedad se reserva (dentro de la transacción de la reserva). */
export async function openReservation(manager: EntityManager, property: Property, tenantId: number) {
  await manager.getRepository(Reservation).insert({
    propertyId: property.id,
    tenantId,
    ownerId: property.ownerId,
    startedAt: property.reservedAt ?? new Date(),
  });
}

/** Cierra la reserva vigente de la propiedad con el motivo que dio el propietario. */
export async function closeReservation(manager: EntityManager, propertyId: number, reason: string) {
  await manager.getRepository(Reservation).update(
    { propertyId, endedAt: IsNull() },
    { endedAt: new Date(), endReason: reason },
  );
}

@Injectable()
export class ReservationHistoryService {
  constructor(private readonly dataSource: DataSource) {}

  private get reservations() {
    return this.dataSource.getRepository(Reservation);
  }

  /** Historial privado de un inquilino: solo él mismo o un administrador. */
  async forTenant(tenantId: number, requester: Requester) {
    if (tenantId !== requester.id && !requester.roles.includes(AppRole.ADMIN)) {
      throw new ForbiddenException({ code: 'API_NO_PUEDES_CONSULTAR_LOS_DATOS_DE_OTRO_USUARIO', message: 'No puedes consultar los datos de otro usuario', params: {} });
    }
    const rows = await this.reservations.find({
      where: { tenantId },
      relations: { property: true, owner: true, tenant: true },
      order: { startedAt: 'DESC', id: 'DESC' },
    });
    return rows.map(toView);
  }

  /** Historial de alquileres de una propiedad y cuántas veces se ha alquilado: su propietario o un administrador. */
  async forProperty(propertyId: number, requester: Requester) {
    const property = await this.dataSource.getRepository(Property).findOneBy({ id: propertyId });
    if (!property) throw new NotFoundException({ code: 'API_PROPIEDAD_NO_ENCONTRADA', message: 'Propiedad no encontrada', params: {} });
    if (property.ownerId !== requester.id && !requester.roles.includes(AppRole.ADMIN)) {
      throw new ForbiddenException({ code: 'API_NO_PUEDES_CONSULTAR_LOS_DATOS_DE_OTRO_USUARIO', message: 'No puedes consultar los datos de otro usuario', params: {} });
    }
    const rows = await this.reservations.find({
      where: { propertyId },
      relations: { property: true, owner: true, tenant: true },
      order: { startedAt: 'DESC', id: 'DESC' },
    });
    return { propertyId, timesRented: rows.length, reservations: rows.map(toView) };
  }

  /** Cuántas veces se ha alquilado cada propiedad de un propietario (para mostrarlo en su listado). */
  async countsForOwner(ownerId: number, requester: Requester) {
    if (ownerId !== requester.id && !requester.roles.includes(AppRole.ADMIN)) {
      throw new ForbiddenException({ code: 'API_NO_PUEDES_CONSULTAR_LOS_DATOS_DE_OTRO_USUARIO', message: 'No puedes consultar los datos de otro usuario', params: {} });
    }
    const rows: { propertyId: number; timesRented: string }[] = await this.reservations.createQueryBuilder('reservation')
      .select('reservation.propertyId', 'propertyId')
      .addSelect('COUNT(*)', 'timesRented')
      .where('reservation.ownerId = :ownerId', { ownerId })
      .groupBy('reservation.propertyId')
      .getRawMany();
    return rows.map((row) => ({ propertyId: Number(row.propertyId), timesRented: Number(row.timesRented) }));
  }
}
