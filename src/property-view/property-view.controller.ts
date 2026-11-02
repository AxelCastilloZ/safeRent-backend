import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { Public } from '../auth/access';
import { RecordViewDto } from './dto/record-view.dto';
import { PropertyViewService } from './property-view.service';

@Controller('property-views')
export class PropertyViewController {
  constructor(private readonly views: PropertyViewService) {}

  @Public()
  @Get(':propertyId')
  count(@Param('propertyId', ParseIntPipe) propertyId: number) {
    return this.views.views(propertyId);
  }

  @Public()
  @Post(':propertyId')
  record(@Param('propertyId', ParseIntPipe) propertyId: number, @Body() dto: RecordViewDto) {
    return this.views.record(propertyId, dto.visitorId);
  }
}
