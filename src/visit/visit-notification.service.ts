import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { BrevoMailService } from '../mail/brevo-mail.service';
import { buildDigestEmail, buildVisitEmail, EMAIL_RECIPIENT, type VisitEmailEvent } from './visit-emails';
import { OWNER_REMINDER_HOURS } from './visit.constants';

/** Número fijo para que, con varios servidores encendidos, solo uno arme el resumen (candado de PostgreSQL). */
const DIGEST_LOCK = 8_271_001;
const HOUR = 3_600_000;

interface VisitMailRow {
  scheduledAt: Date;
  previousScheduledAt: Date | null;
  timezone: string;
  cancelReason: string | null;
  propertyTitle: string;
  tenantName: string; tenantSurname: string; tenantEmail: string | null; tenantLanguage: string | null; tenantActive: boolean;
  ownerName: string; ownerSurname: string; ownerEmail: string | null; ownerLanguage: string | null; ownerActive: boolean;
}

const VISIT_MAIL_QUERY = `
  SELECT v."scheduledAt", v."previousScheduledAt", v.timezone, v."cancelReason", p.title AS "propertyTitle",
         t.name AS "tenantName", t.surname1 AS "tenantSurname", t.email AS "tenantEmail", t."preferredLanguage" AS "tenantLanguage", t."isActive" AS "tenantActive",
         o.name AS "ownerName", o.surname1 AS "ownerSurname", o.email AS "ownerEmail", o."preferredLanguage" AS "ownerLanguage", o."isActive" AS "ownerActive"
    FROM visit v
    JOIN property p ON p.id = v."propertyId"
    JOIN "user" t ON t.id = v."tenantId"
    JOIN "user" o ON o.id = v."ownerId"
   WHERE v.id = $1`;

/**
 * Avisos por correo de las citas. Nunca hacen fallar la acción que los origina: si el correo no sale,
 * se anota el motivo (sin datos de nadie) y la cita sigue su curso. Se pueden apagar con VISIT_EMAILS_ENABLED=false.
 */
@Injectable()
export class VisitNotificationService {
  private readonly logger = new Logger(VisitNotificationService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly mail: BrevoMailService,
    private readonly config: ConfigService,
  ) {}

  private get enabled() {
    return this.config.get<string>('VISIT_EMAILS_ENABLED') !== 'false';
  }

  /** Avisa a la otra persona de la cita. Devuelve true si el correo salió. */
  async notify(visitId: number, event: VisitEmailEvent): Promise<boolean> {
    if (!this.enabled) return false;
    try {
      const [row] = await this.dataSource.query<VisitMailRow[]>(VISIT_MAIL_QUERY, [visitId]);
      if (!row) return false;
      const toOwner = EMAIL_RECIPIENT[event] === 'owner';
      const recipient = toOwner
        ? { email: row.ownerEmail, language: row.ownerLanguage, active: row.ownerActive }
        : { email: row.tenantEmail, language: row.tenantLanguage, active: row.tenantActive };
      if (!recipient.email || !recipient.active) return false;

      // La persona que se nombra en el correo es la otra: al propietario se le habla del inquilino y al revés.
      const person = toOwner ? `${row.tenantName} ${row.tenantSurname}` : `${row.ownerName} ${row.ownerSurname}`;
      const content = buildVisitEmail(event, {
        person, property: row.propertyTitle, when: new Date(row.scheduledAt), timezone: row.timezone,
        previous: row.previousScheduledAt ? new Date(row.previousScheduledAt) : null,
        // Solo las cancelaciones hechas por una persona llevan motivo (la automática por reserva usa un código interno).
        reason: event === 'CANCELLED_BY_OWNER' || event === 'CANCELLED_BY_TENANT' ? row.cancelReason : null,
      }, recipient.language);
      await this.mail.sendNotification(recipient.email, recipient.language ?? 'es', content);
      return true;
    } catch (error) {
      this.logger.warn(`No se pudo enviar el aviso ${event} de la cita ${visitId} (${(error as Error).name}).`);
      return false;
    }
  }

  /** Avisa de las solicitudes y propuestas que vencieron sin respuesta: al inquilino si no respondió el propietario, y al revés. */
  async notifyExpired(rows: { id: number; previousStatus: string }[]): Promise<void> {
    for (const row of rows) {
      await this.notify(row.id, row.previousStatus === 'COUNTER_PROPOSED' ? 'EXPIRED_PROPOSAL' : 'EXPIRED_REQUEST');
    }
  }

  @Interval('visit-owner-digest', HOUR)
  async scheduledDigest(): Promise<void> {
    try {
      await this.runDigest();
    } catch (error) {
      this.logger.warn(`No se pudo armar el resumen de citas (${(error as Error).name}).`);
    }
  }

  /**
   * Un correo por propietario con solicitudes sin responder, a lo sumo cada 12 horas. Primero se "reclaman" las
   * citas (se marca la hora del aviso) y después se envía: así, aunque haya varios servidores o se reinicie uno,
   * nadie recibe el mismo resumen dos veces. Devuelve cuántos correos salieron.
   */
  async runDigest(now = new Date()): Promise<number> {
    if (!this.enabled) return 0;
    const claimed = await this.dataSource.transaction(async (manager) => {
      const [lock] = await manager.query<{ locked: boolean }[]>('SELECT pg_try_advisory_xact_lock($1) AS locked', [DIGEST_LOCK]);
      if (!lock.locked) return [];
      const result = await manager.query(
        `WITH due AS (
           SELECT "ownerId" FROM visit
            WHERE status = 'PENDING' AND "expiresAt" > $1
            GROUP BY "ownerId"
           HAVING COALESCE(max("ownerNotifiedAt"), 'epoch'::timestamptz) < $1::timestamptz - make_interval(hours => $2::int)
         )
         UPDATE visit SET "ownerNotifiedAt" = $1
          WHERE status = 'PENDING' AND "expiresAt" > $1 AND "ownerId" IN (SELECT "ownerId" FROM due)
         RETURNING id, "ownerId", "createdAt"`,
        [now, OWNER_REMINDER_HOURS],
      );
      // UPDATE ... RETURNING devuelve [filas, cantidad] según el driver.
      return (Array.isArray(result[0]) ? result[0] : result) as { id: number; ownerId: number; createdAt: Date }[];
    });

    const byOwner = new Map<number, { id: number; createdAt: Date }[]>();
    for (const row of claimed) byOwner.set(row.ownerId, [...(byOwner.get(row.ownerId) ?? []), row]);

    let sent = 0;
    for (const visits of byOwner.values()) {
      const oldest = visits.reduce((a, b) => (new Date(a.createdAt) <= new Date(b.createdAt) ? a : b));
      try {
        const [row] = await this.dataSource.query<VisitMailRow[]>(VISIT_MAIL_QUERY, [oldest.id]);
        if (!row?.ownerEmail || !row.ownerActive) continue;
        const content = buildDigestEmail({
          count: visits.length, person: `${row.tenantName} ${row.tenantSurname}`, property: row.propertyTitle,
          when: new Date(row.scheduledAt), timezone: row.timezone,
        }, row.ownerLanguage);
        await this.mail.sendNotification(row.ownerEmail, row.ownerLanguage ?? 'es', content);
        sent += 1;
      } catch (error) {
        this.logger.warn(`No se pudo enviar el resumen de citas (${(error as Error).name}).`);
      }
    }
    return sent;
  }
}
