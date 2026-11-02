import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppRole } from '../auth/access';
import { Reservation } from '../reservation/entities/reservation.entity';
import { User } from '../user/entities/user.entity';
import { RateTenantDto } from './dto/rate-tenant.dto';
import { TenantRating } from './entities/tenant-rating.entity';

type Requester = { id: number; roles: string[] };

const errors = {
  reservationNotFound: () => new NotFoundException({ code: 'API_RESERVA_NO_ENCONTRADA', message: 'Reserva no encontrada', params: {} }),
  notYourReservation: () => new ForbiddenException({ code: 'API_SOLO_EL_PROPIETARIO_PUEDE_CALIFICAR_A_SU_INQUILINO', message: 'Solo el propietario de la reserva puede calificar a su inquilino', params: {} }),
  tenantNotFound: () => new NotFoundException({ code: 'API_INQUILINO_NO_ENCONTRADO', message: 'Inquilino no encontrado', params: {} }),
  otherUser: () => new ForbiddenException({ code: 'API_NO_PUEDES_CONSULTAR_LOS_DATOS_DE_OTRO_USUARIO', message: 'No puedes consultar los datos de otro usuario', params: {} }),
};

const fullName = (user: Pick<User, 'name' | 'surname1'>) => [user.name, user.surname1].filter(Boolean).join(' ');

/** Promedio (con un decimal), cantidad y cuántas calificaciones hay de cada puntaje. */
export function summarize(ratings: { rating: number }[]) {
  const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const { rating } of ratings) distribution[rating] += 1;
  const count = ratings.length;
  const average = count ? Math.round((ratings.reduce((sum, item) => sum + item.rating, 0) / count) * 10) / 10 : null;
  return { average, count, distribution };
}

@Injectable()
export class TenantRatingService {
  constructor(private readonly dataSource: DataSource) {}

  /** El propietario califica (o edita su calificación) al inquilino de una de sus reservas, vigente o terminada. */
  async rate(reservationId: number, ownerId: number, dto: RateTenantDto) {
    const reservation = await this.dataSource.getRepository(Reservation).findOneBy({ id: reservationId });
    if (!reservation) throw errors.reservationNotFound();
    if (reservation.ownerId !== ownerId) throw errors.notYourReservation();

    const comment = dto.comment?.trim() || null;
    // Una sola sentencia: si el propietario ya la había calificado, se edita (y así dos envíos seguidos no chocan).
    await this.dataSource.query(
      `INSERT INTO "tenant_rating" ("reservationId", "tenantId", "ownerId", "rating", "comment")
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT ("reservationId") DO UPDATE SET "rating" = EXCLUDED."rating", "comment" = EXCLUDED."comment", "updatedAt" = now()`,
      [reservationId, reservation.tenantId, ownerId, dto.rating, comment],
    );
    const saved = await this.dataSource.getRepository(TenantRating).findOneByOrFail({ reservationId });
    return { id: saved.id, reservationId, tenantId: saved.tenantId, rating: saved.rating, comment: saved.comment, createdAt: saved.createdAt, updatedAt: saved.updatedAt };
  }

  /** Quién puede ver las calificaciones de un inquilino: propietarios y administradores, y el inquilino las suyas. */
  private async assertCanSee(tenantId: number, requester: Requester) {
    const isStaff = requester.roles.includes(AppRole.OWNER) || requester.roles.includes(AppRole.ADMIN);
    if (!isStaff && requester.id !== tenantId) throw errors.otherUser();
    // Solo existe para el público quien es inquilino: así no se consulta el nombre de cualquier usuario por su id.
    const tenant = await this.dataSource.getRepository(User).findOne({ where: { id: tenantId }, relations: { Roles: true } });
    if (!tenant || !tenant.Roles.some((role) => role.name === AppRole.CLIENT)) throw errors.tenantNotFound();
    return tenant;
  }

  /** Solo el puntaje: para el distintivo junto al nombre del inquilino. */
  async summary(tenantId: number, requester: Requester) {
    await this.assertCanSee(tenantId, requester);
    const rows = await this.dataSource.getRepository(TenantRating).find({ where: { tenantId }, select: { id: true, rating: true } });
    const { average, count } = summarize(rows);
    return { tenantId, average, count };
  }

  /** Perfil del inquilino: su puntaje, lo que dijeron otros propietarios y, para un propietario, sus propias reservas con él. */
  async forTenant(tenantId: number, requester: Requester) {
    const tenant = await this.assertCanSee(tenantId, requester);
    const rows = await this.dataSource.getRepository(TenantRating).find({
      where: { tenantId },
      relations: { owner: true, reservation: { property: true } },
      order: { updatedAt: 'DESC', id: 'DESC' },
    });

    const ratings = rows.map((row) => ({
      id: row.id,
      rating: row.rating,
      comment: row.comment,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      // Del propietario solo se muestra el nombre, igual que en sus publicaciones.
      owner: { name: row.owner?.name ?? '' },
      property: { title: row.reservation?.property?.title ?? '' },
      mine: row.ownerId === requester.id,
    }));

    let myReservations: unknown[] = [];
    if (requester.roles.includes(AppRole.OWNER)) {
      const reservations = await this.dataSource.getRepository(Reservation).find({
        where: { tenantId, ownerId: requester.id },
        relations: { property: true },
        order: { startedAt: 'DESC', id: 'DESC' },
      });
      const byReservation = new Map(rows.filter((row) => row.ownerId === requester.id).map((row) => [row.reservationId, row]));
      myReservations = reservations.map((reservation) => {
        const mine = byReservation.get(reservation.id);
        return {
          reservationId: reservation.id,
          active: !reservation.endedAt,
          startedAt: reservation.startedAt,
          endedAt: reservation.endedAt ?? null,
          property: { id: reservation.propertyId, title: reservation.property?.title ?? '' },
          myRating: mine ? { rating: mine.rating, comment: mine.comment } : null,
        };
      });
    }

    return {
      tenant: { id: tenant.id, name: fullName(tenant) },
      summary: summarize(rows),
      ratings,
      myReservations,
    };
  }
}
