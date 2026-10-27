import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailModule } from '../mail/mail.module';
import { PropertyAvailability } from './entities/property-availability.entity';
import { Visit } from './entities/visit.entity';
import { VisitController } from './visit.controller';
import { VisitNotificationService } from './visit-notification.service';
import { VisitService } from './visit.service';

@Module({
  imports: [TypeOrmModule.forFeature([Visit, PropertyAvailability]), MailModule],
  controllers: [VisitController],
  providers: [VisitService, VisitNotificationService],
  exports: [VisitService],
})
export class VisitModule {}
