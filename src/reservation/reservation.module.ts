import { Module } from '@nestjs/common';
import { VisitModule } from '../visit/visit.module';
import { ReservationController } from './reservation.controller';
import { ReservationService } from './reservation.service';

@Module({
  imports: [VisitModule],
  controllers: [ReservationController],
  providers: [ReservationService],
})
export class ReservationModule {}
