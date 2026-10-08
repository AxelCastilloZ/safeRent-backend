import { Controller, Delete, Param, ParseIntPipe, Post, Req } from '@nestjs/common';
import { AppRole, Roles } from '../auth/access';
import type { AuthRequest } from '../auth/access';
import { ReservationService } from './reservation.service';

@Controller('reservations')
export class ReservationController {
  constructor(private readonly reservations: ReservationService) {}

  @Roles(AppRole.OWNER)
  @Delete('property/:propertyId')
  release(@Param('propertyId', ParseIntPipe) propertyId: number, @Req() req: AuthRequest) {
    return this.reservations.release(propertyId, req.user.id);
  }

  @Roles(AppRole.OWNER)
  @Post('conversation/:conversationId')
  reserve(@Param('conversationId', ParseIntPipe) conversationId: number, @Req() req: AuthRequest) {
    return this.reservations.reserve(conversationId, req.user.id);
  }
}
