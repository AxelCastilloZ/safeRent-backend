import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Reservation } from '../reservation/entities/reservation.entity';
import { SubmitStaySurveyDto } from './dto/submit-stay-survey.dto';
import { StaySurvey } from './entities/stay-survey.entity';

const errors = {
  reservationNotFound: () => new NotFoundException({ code: 'API_RESERVA_NO_ENCONTRADA', message: 'Reserva no encontrada', params: {} }),
  notYourReservation: () => new ForbiddenException({ code: 'API_SOLO_EL_INQUILINO_PUEDE_RESPONDER_LA_ENCUESTA', message: 'Solo el inquilino de la reserva puede responder la encuesta de su estadía', params: {} }),
  stillActive: () => new ConflictException({ code: 'API_LA_ESTADIA_AUN_NO_HA_TERMINADO', message: 'La encuesta se responde cuando la estadía ya terminó', params: {} }),
};

/** Promedio con un decimal; null si no hay datos. */
export function average(values: (number | null | undefined)[]) {
  const present = values.filter((value): value is number => typeof value === 'number');
  if (!present.length) return null;
  return Math.round((present.reduce((sum, value) => sum + value, 0) / present.length) * 10) / 10;
}

type SurveyValues = Pick<StaySurvey, 'waterStability' | 'electricityStability' | 'internetMbps' | 'universityKm' | 'coworkingKm' | 'hasWorkArea'>;

/** Resumen público de las encuestas de una propiedad: lo que dijeron en promedio quienes ya vivieron ahí. */
export function summarize(rows: SurveyValues[]) {
  const count = rows.length;
  const workAreaVotes = rows.filter((row) => row.hasWorkArea).length;
  return {
    count,
    waterStability: average(rows.map((row) => row.waterStability)),
    electricityStability: average(rows.map((row) => row.electricityStability)),
    internetMbps: average(rows.map((row) => row.internetMbps)),
    universityKm: average(rows.map((row) => row.universityKm)),
    coworkingKm: average(rows.map((row) => row.coworkingKm)),
    workAreaVotes,
    // Hay área de trabajo si la mayoría de los inquilinos dijo que sí.
    hasWorkArea: count > 0 && workAreaVotes * 2 > count,
  };
}

@Injectable()
export class StaySurveyService {
  constructor(private readonly dataSource: DataSource) {}

  /** El inquilino responde (o corrige) la encuesta de una de sus estadías ya terminadas. */
  async submit(reservationId: number, tenantId: number, dto: SubmitStaySurveyDto) {
    const reservation = await this.dataSource.getRepository(Reservation).findOneBy({ id: reservationId });
    if (!reservation) throw errors.reservationNotFound();
    if (reservation.tenantId !== tenantId) throw errors.notYourReservation();
    if (!reservation.endedAt) throw errors.stillActive();

    // Una sola sentencia: si ya la había respondido se corrige (y dos envíos seguidos no chocan).
    await this.dataSource.query(
      `INSERT INTO "stay_survey" ("reservationId", "propertyId", "tenantId", "waterStability", "electricityStability", "internetMbps", "universityKm", "coworkingKm", "hasWorkArea")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT ("reservationId") DO UPDATE SET "waterStability" = EXCLUDED."waterStability", "electricityStability" = EXCLUDED."electricityStability",
         "internetMbps" = EXCLUDED."internetMbps", "universityKm" = EXCLUDED."universityKm", "coworkingKm" = EXCLUDED."coworkingKm",
         "hasWorkArea" = EXCLUDED."hasWorkArea", "updatedAt" = now()`,
      [reservationId, reservation.propertyId, tenantId, dto.waterStability, dto.electricityStability, dto.internetMbps, dto.universityKm ?? null, dto.coworkingKm ?? null, dto.hasWorkArea],
    );
    const saved = await this.dataSource.getRepository(StaySurvey).findOneByOrFail({ reservationId });
    return this.toView(saved);
  }

  /** Estadías terminadas del inquilino con su encuesta (o sin ella, si está pendiente). */
  async mine(tenantId: number) {
    const reservations = await this.dataSource.getRepository(Reservation).find({
      where: { tenantId },
      relations: { property: true },
      order: { endedAt: 'DESC', id: 'DESC' },
    });
    const ended = reservations.filter((reservation) => reservation.endedAt);
    const surveys = await this.dataSource.getRepository(StaySurvey).find({ where: { tenantId } });
    const byReservation = new Map(surveys.map((survey) => [survey.reservationId, survey]));
    return ended.map((reservation) => {
      const survey = byReservation.get(reservation.id);
      return {
        reservationId: reservation.id,
        endedAt: reservation.endedAt,
        property: { id: reservation.propertyId, title: reservation.property?.title ?? '' },
        survey: survey ? this.toView(survey) : null,
      };
    });
  }

  /** Promedios públicos de una propiedad. */
  async summary(propertyId: number) {
    const rows = await this.dataSource.getRepository(StaySurvey).find({ where: { propertyId } });
    return { propertyId, ...summarize(rows) };
  }

  private toView(survey: StaySurvey) {
    return {
      id: survey.id,
      reservationId: survey.reservationId,
      propertyId: survey.propertyId,
      waterStability: survey.waterStability,
      electricityStability: survey.electricityStability,
      internetMbps: survey.internetMbps,
      universityKm: survey.universityKm,
      coworkingKm: survey.coworkingKm,
      hasWorkArea: survey.hasWorkArea,
      updatedAt: survey.updatedAt,
    };
  }
}
