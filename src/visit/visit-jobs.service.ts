import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { VisitNotificationService } from './visit-notification.service';
import { EXPIRY_JOB_MS, REMINDER_BEFORE_HOURS, REMINDER_JOB_MS, REMINDER_MIN_CONFIRMED_HOURS } from './visit.constants';

const rowsOf = <T>(result: unknown): T[] => (Array.isArray((result as unknown[])[0]) ? (result as T[][])[0] : (result as T[]));

/**
 * Tareas de fondo de las citas: pasar a "vencida" lo que nadie respondió a tiempo y recordar las citas próximas.
 * Cada una "reclama" las filas con SKIP LOCKED y las marca en la misma sentencia, así que con varios servidores
 * encendidos (o tras un reinicio) nadie recibe dos veces el mismo aviso.
 */
@Injectable()
export class VisitJobsService {
  private readonly logger = new Logger(VisitJobsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly notifier: VisitNotificationService,
  ) {}

  @Interval('visit-expiry', EXPIRY_JOB_MS)
  async scheduledExpiry(): Promise<void> {
    try {
      await this.expireStale();
    } catch (error) {
      this.logger.warn(`No se pudo revisar el vencimiento de citas (${(error as Error).name}).`);
    }
  }

  @Interval('visit-reminders', REMINDER_JOB_MS)
  async scheduledReminders(): Promise<void> {
    try {
      await this.sendReminders();
    } catch (error) {
      this.logger.warn(`No se pudieron enviar los recordatorios de citas (${(error as Error).name}).`);
    }
  }

  /**
   * Pasa a "vencida" cada solicitud (o propuesta de otro horario) que superó su plazo, liberando el horario,
   * y avisa a quien quedó esperando. Devuelve cuántas venció.
   */
  async expireStale(now = new Date()): Promise<number> {
    const result = await this.dataSource.query(
      `WITH stale AS (
         SELECT id, status FROM visit
          WHERE status IN ('PENDING', 'COUNTER_PROPOSED') AND "expiresAt" <= $1
            FOR UPDATE SKIP LOCKED)
       UPDATE visit v SET status = 'EXPIRED', "updatedAt" = $1 FROM stale s WHERE v.id = s.id
       RETURNING v.id, s.status AS "previousStatus"`,
      [now],
    );
    const expired = rowsOf<{ id: number; previousStatus: string }>(result);
    await this.notifier.notifyExpired(expired);
    return expired.length;
  }

  /**
   * Recuerda a las dos personas una cita confirmada que ocurre en las próximas 24 horas (una sola vez).
   * Si la cita se confirmó hace muy poco, no se recuerda: el correo de confirmación ya es el aviso.
   * Devuelve cuántas citas recordó.
   */
  async sendReminders(now = new Date()): Promise<number> {
    const result = await this.dataSource.query(
      `UPDATE visit SET "reminderSentAt" = $1
        WHERE id IN (
          SELECT id FROM visit
           WHERE status = 'CONFIRMED' AND "reminderSentAt" IS NULL
             AND "scheduledAt" > $1::timestamptz + interval '1 hour'
             AND "scheduledAt" <= $1::timestamptz + make_interval(hours => $2::int)
             AND "confirmedAt" <= $1::timestamptz - make_interval(hours => $3::int)
             FOR UPDATE SKIP LOCKED)
       RETURNING id`,
      [now, REMINDER_BEFORE_HOURS, REMINDER_MIN_CONFIRMED_HOURS],
    );
    const due = rowsOf<{ id: number }>(result);
    for (const { id } of due) {
      await this.notifier.notify(id, 'REMINDER_TENANT');
      await this.notifier.notify(id, 'REMINDER_OWNER');
    }
    return due.length;
  }
}
