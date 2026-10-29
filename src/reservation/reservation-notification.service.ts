import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { BrevoMailService } from '../mail/brevo-mail.service';
import { User } from '../user/entities/user.entity';
import { buildReservationEmail, type ReservationEmailEvent } from './reservation-emails';

export interface ReservationNotice {
  propertyId: number;
  property: string;
  ownerId: number;
  tenantId: number;
  reason?: string;
}

/** Usa el mismo transporte y formato que las citas, después de confirmar la transacción. */
@Injectable()
export class ReservationNotificationService {
  private readonly logger = new Logger(ReservationNotificationService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly mail: BrevoMailService,
    private readonly config: ConfigService,
  ) {}

  async notify(event: ReservationEmailEvent, notice: ReservationNotice): Promise<void> {
    if (this.config.get<string>('VISIT_EMAILS_ENABLED') === 'false') return;
    try {
      const users = this.dataSource.getRepository(User);
      const [owner, tenant] = await Promise.all([
        users.findOneBy({ id: notice.ownerId }),
        users.findOneBy({ id: notice.tenantId }),
      ]);
      await Promise.all((['owner', 'tenant'] as const).map(async (role) => {
        const recipient = role === 'owner' ? owner : tenant;
        const other = role === 'owner' ? tenant : owner;
        if (!recipient?.email || !recipient.isActive) return;
        try {
          const content = buildReservationEmail(event, {
            property: notice.property,
            person: [other?.name, other?.surname1].filter(Boolean).join(' '),
            reason: notice.reason,
          }, recipient.preferredLanguage, role);
          await this.mail.sendNotification(recipient.email, recipient.preferredLanguage ?? 'es', content);
        } catch (error) {
          this.warn(event, notice.propertyId, error);
        }
      }));
    } catch (error) {
      this.warn(event, notice.propertyId, error);
    }
  }

  private warn(event: ReservationEmailEvent, propertyId: number, error: unknown) {
    this.logger.warn(`No se pudo enviar el aviso ${event} de la reserva ${propertyId} (${(error as Error).name}).`);
  }
}
