import { Module } from '@nestjs/common';
import { VisitModule } from '../visit/visit.module';
import { ReservationController } from './reservation.controller';
import { ReservationService } from './reservation.service';
import { MailModule } from '../mail/mail.module';
import { ReservationNotificationService } from './reservation-notification.service';

@Module({
  imports: [VisitModule, MailModule],
  controllers: [ReservationController],
  providers: [ReservationService, ReservationNotificationService],
})
export class ReservationModule {}
