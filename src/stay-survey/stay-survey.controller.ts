import { Body, Controller, Get, Param, ParseIntPipe, Put, Req } from '@nestjs/common';
import { AppRole, Public, Roles } from '../auth/access';
import type { AuthRequest } from '../auth/access';
import { SubmitStaySurveyDto } from './dto/submit-stay-survey.dto';
import { StaySurveyService } from './stay-survey.service';

@Controller('stay-surveys')
export class StaySurveyController {
  constructor(private readonly surveys: StaySurveyService) {}

  /** Las estadías terminadas del inquilino y si ya respondió su encuesta. */
  @Roles(AppRole.CLIENT)
  @Get('mine')
  mine(@Req() req: AuthRequest) {
    return this.surveys.mine(req.user.id);
  }

  /** Responder (o corregir) la encuesta de una estadía terminada. */
  @Roles(AppRole.CLIENT)
  @Put('reservation/:reservationId')
  submit(@Param('reservationId', ParseIntPipe) reservationId: number, @Body() dto: SubmitStaySurveyDto, @Req() req: AuthRequest) {
    return this.surveys.submit(reservationId, req.user.id, dto);
  }

  /** Lo que dijeron en promedio los inquilinos que ya vivieron en la propiedad. */
  @Public()
  @Get('property/:propertyId/summary')
  summary(@Param('propertyId', ParseIntPipe) propertyId: number) {
    return this.surveys.summary(propertyId);
  }
}
