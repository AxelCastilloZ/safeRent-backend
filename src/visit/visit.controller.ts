import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { AppRole, Roles } from '../auth/access';
import type { AuthRequest } from '../auth/access';
import { CancelVisitDto, CreateVisitDto, ProposeVisitDto, SetAvailabilityDto, SlotsQueryDto } from './dto/visit.dto';
import { VisitService } from './visit.service';

/**
 * Citas para visitar propiedades. El usuario siempre sale del token, nunca del cuerpo ni de la ruta:
 * el inquilino pide y responde contrapropuestas; el propietario confirma, propone otro horario y configura su disponibilidad.
 */
@Controller('visits')
export class VisitController {
  constructor(private readonly visits: VisitService) {}

  // Calendario: lo usa el inquilino para elegir y el propietario para proponer otro horario.
  @Roles(AppRole.CLIENT, AppRole.OWNER)
  @Get('properties/:propertyId/slots')
  slots(@Param('propertyId', ParseIntPipe) propertyId: number, @Query() query: SlotsQueryDto) {
    return this.visits.slots(propertyId, query);
  }

  @Roles(AppRole.OWNER)
  @Get('properties/:propertyId/availability')
  availability(@Param('propertyId', ParseIntPipe) propertyId: number, @Req() req: AuthRequest) {
    return this.visits.getAvailability(propertyId, req.user.id);
  }

  @Roles(AppRole.OWNER)
  @Put('properties/:propertyId/availability')
  setAvailability(@Param('propertyId', ParseIntPipe) propertyId: number, @Body() dto: SetAvailabilityDto, @Req() req: AuthRequest) {
    return this.visits.setAvailability(propertyId, req.user.id, dto);
  }

  @Roles(AppRole.CLIENT)
  @Post()
  request(@Body() dto: CreateVisitDto, @Req() req: AuthRequest) {
    return this.visits.request(req.user.id, dto);
  }

  @Roles(AppRole.CLIENT)
  @Get('mine')
  mine(@Req() req: AuthRequest) {
    return this.visits.listMine(req.user.id);
  }

  @Roles(AppRole.OWNER)
  @Get('received')
  received(@Req() req: AuthRequest) {
    return this.visits.listReceived(req.user.id);
  }

  // Cifras para los contadores del menú y los inicios.
  @Roles(AppRole.CLIENT, AppRole.OWNER)
  @Get('summary')
  summary(@Req() req: AuthRequest) {
    return this.visits.summary(req.user.id);
  }

  @Roles(AppRole.OWNER)
  @Patch(':id/confirm')
  confirm(@Param('id', ParseIntPipe) id: number, @Req() req: AuthRequest) {
    return this.visits.confirm(id, req.user.id);
  }

  @Roles(AppRole.OWNER)
  @Patch(':id/propose')
  propose(@Param('id', ParseIntPipe) id: number, @Body() dto: ProposeVisitDto, @Req() req: AuthRequest) {
    return this.visits.propose(id, req.user.id, dto.scheduledAt);
  }

  @Roles(AppRole.CLIENT)
  @Patch(':id/accept')
  accept(@Param('id', ParseIntPipe) id: number, @Req() req: AuthRequest) {
    return this.visits.accept(id, req.user.id);
  }

  @Roles(AppRole.CLIENT, AppRole.OWNER)
  @Patch(':id/cancel')
  cancel(@Param('id', ParseIntPipe) id: number, @Body() dto: CancelVisitDto, @Req() req: AuthRequest) {
    return this.visits.cancel(id, req.user.id, dto.reason);
  }
}
