import { Body, Controller, Get, Param, ParseIntPipe, Put, Req } from '@nestjs/common';
import { AppRole, Roles } from '../auth/access';
import type { AuthRequest } from '../auth/access';
import { RateTenantDto } from './dto/rate-tenant.dto';
import { TenantRatingService } from './tenant-rating.service';

@Controller('tenant-ratings')
export class TenantRatingController {
  constructor(private readonly ratings: TenantRatingService) {}

  /** Calificar (o editar la calificación de) el inquilino de una reserva propia. */
  @Roles(AppRole.OWNER)
  @Put('reservation/:reservationId')
  rate(@Param('reservationId', ParseIntPipe) reservationId: number, @Body() dto: RateTenantDto, @Req() req: AuthRequest) {
    return this.ratings.rate(reservationId, req.user.id, dto);
  }

  @Roles(AppRole.OWNER, AppRole.ADMIN, AppRole.CLIENT)
  @Get('tenant/:tenantId/summary')
  summary(@Param('tenantId', ParseIntPipe) tenantId: number, @Req() req: AuthRequest) {
    return this.ratings.summary(tenantId, req.user);
  }

  @Roles(AppRole.OWNER, AppRole.ADMIN, AppRole.CLIENT)
  @Get('tenant/:tenantId')
  forTenant(@Param('tenantId', ParseIntPipe) tenantId: number, @Req() req: AuthRequest) {
    return this.ratings.forTenant(tenantId, req.user);
  }
}
