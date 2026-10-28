import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Req } from '@nestjs/common';
import { AppRole, Roles } from '../auth/access';
import type { AuthRequest } from '../auth/access';
import { ReservationService } from './reservation.service';
import { ReleaseReservationDto } from './release-reservation.dto';
import { ReservationHistoryService } from './reservation-history.service';

@Controller('reservations')
export class ReservationController {
  constructor(private readonly reservations: ReservationService, private readonly history: ReservationHistoryService) {}

  // --- Historial (rutas específicas antes de las que reciben un id) ---

  /** Historial privado de reservas del usuario de la sesión. */
  @Roles(AppRole.CLIENT, AppRole.OWNER, AppRole.ADMIN)
  @Get('me')
  mine(@Req() req: AuthRequest) {
    return this.history.forTenant(req.user.id, req.user);
  }

  /** Historial de reservas de un usuario: el propio usuario o un administrador. */
  @Roles(AppRole.CLIENT, AppRole.OWNER, AppRole.ADMIN)
  @Get('user/:userId')
  forUser(@Param('userId', ParseIntPipe) userId: number, @Req() req: AuthRequest) {
    return this.history.forTenant(userId, req.user);
  }

  /** Historial de alquileres de una propiedad y cuántas veces se alquiló: su propietario o un administrador. */
  @Roles(AppRole.CLIENT, AppRole.OWNER, AppRole.ADMIN)
  @Get('property/:propertyId')
  forProperty(@Param('propertyId', ParseIntPipe) propertyId: number, @Req() req: AuthRequest) {
    return this.history.forProperty(propertyId, req.user);
  }

  /** Veces que se alquiló cada propiedad de un propietario: el propio propietario o un administrador. */
  @Roles(AppRole.CLIENT, AppRole.OWNER, AppRole.ADMIN)
  @Get('owner/:ownerId/counts')
  countsForOwner(@Param('ownerId', ParseIntPipe) ownerId: number, @Req() req: AuthRequest) {
    return this.history.countsForOwner(ownerId, req.user);
  }

  // --- Reservar y quitar la reserva ---

  @Roles(AppRole.OWNER)
  @Delete('property/:propertyId')
  release(@Param('propertyId', ParseIntPipe) propertyId: number, @Req() req: AuthRequest, @Body() dto: ReleaseReservationDto) {
    return this.reservations.release(propertyId, req.user.id, dto.reason);
  }

  @Roles(AppRole.OWNER)
  @Post('visit/:visitId')
  reserveFromVisit(@Param('visitId', ParseIntPipe) visitId: number, @Req() req: AuthRequest) {
    return this.reservations.reserveFromVisit(visitId, req.user.id);
  }

  @Roles(AppRole.OWNER)
  @Post('conversation/:conversationId')
  reserve(@Param('conversationId', ParseIntPipe) conversationId: number, @Req() req: AuthRequest) {
    return this.reservations.reserve(conversationId, req.user.id);
  }
}
