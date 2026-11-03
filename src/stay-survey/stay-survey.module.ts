import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Property } from '../property/entities/property.entity';
import { Reservation } from '../reservation/entities/reservation.entity';
import { StaySurvey } from './entities/stay-survey.entity';
import { StaySurveyController } from './stay-survey.controller';
import { StaySurveyService } from './stay-survey.service';

@Module({
  imports: [TypeOrmModule.forFeature([StaySurvey, Reservation, Property])],
  controllers: [StaySurveyController],
  providers: [StaySurveyService],
})
export class StaySurveyModule {}
