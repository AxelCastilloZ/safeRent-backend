import { Body, Controller, Delete, Get, ParseIntPipe, Param, Post, Put, Query, Req } from '@nestjs/common';
import { AppRole, Roles } from '../auth/access';
import type { AuthRequest } from '../auth/access';
import { PropertyPricingService } from '../property/property-pricing.service';
import { ImportSavedPropertiesDto } from './dto/import-saved-properties.dto';
import { SavedPropertiesQueryDto } from './dto/saved-properties-query.dto';
import { SavedPropertyService } from './saved-property.service';

// Solo inquilinos. El usuario siempre sale del token: nadie puede ver ni cambiar las guardadas de otra persona.
@Roles(AppRole.CLIENT)
@Controller('saved-properties')
export class SavedPropertyController {
  constructor(
    private readonly saved: SavedPropertyService,
    private readonly pricing: PropertyPricingService,
  ) {}

  @Get()
  async list(@Req() req: AuthRequest, @Query() query: SavedPropertiesQueryDto) {
    const items = await this.saved.list(req.user.id);
    return this.pricing.decorate(items, await this.pricing.prepare(query));
  }

  @Get('ids')
  ids(@Req() req: AuthRequest) {
    return this.saved.listIds(req.user.id);
  }

  @Post('import')
  importMany(@Req() req: AuthRequest, @Body() dto: ImportSavedPropertiesDto) {
    return this.saved.importMany(req.user.id, dto.propertyIds);
  }

  @Put(':propertyId')
  save(@Param('propertyId', ParseIntPipe) propertyId: number, @Req() req: AuthRequest) {
    return this.saved.save(req.user.id, propertyId);
  }

  @Delete(':propertyId')
  remove(@Param('propertyId', ParseIntPipe) propertyId: number, @Req() req: AuthRequest) {
    return this.saved.remove(req.user.id, propertyId);
  }
}
