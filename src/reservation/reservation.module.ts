import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VisitModule } from '../visit/visit.module';
import { ReservationController } from './reservation.controller';
import { ReservationService } from './reservation.service';
import { MailModule } from '../mail/mail.module';
import { ReservationNotificationService } from './reservation-notification.service';
import { Reservation } from './entities/reservation.entity';
import { ReservationHistoryService } from './reservation-history.service';

@Module({
  imports: [TypeOrmModule.forFeature([Reservation]), VisitModule, MailModule],
  controllers: [ReservationController],
  providers: [ReservationService, ReservationNotificationService, ReservationHistoryService],
})
export class ReservationModule {}
