import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Reservation } from '../reservation/entities/reservation.entity';
import { User } from '../user/entities/user.entity';
import { TenantRating } from './entities/tenant-rating.entity';
import { TenantRatingController } from './tenant-rating.controller';
import { TenantRatingService } from './tenant-rating.service';

@Module({
  imports: [TypeOrmModule.forFeature([TenantRating, Reservation, User])],
  controllers: [TenantRatingController],
  providers: [TenantRatingService],
})
export class TenantRatingModule {}
