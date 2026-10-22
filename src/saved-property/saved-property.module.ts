import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Property } from '../property/entities/property.entity';
import { PropertyModule } from '../property/property.module';
import { SavedProperty } from './entities/saved-property.entity';
import { SavedPropertyController } from './saved-property.controller';
import { SavedPropertyService } from './saved-property.service';

@Module({
  // PropertyModule entrega PropertyPricingService (precio en la moneda del usuario).
  imports: [TypeOrmModule.forFeature([SavedProperty, Property]), PropertyModule],
  controllers: [SavedPropertyController],
  providers: [SavedPropertyService],
})
export class SavedPropertyModule {}
