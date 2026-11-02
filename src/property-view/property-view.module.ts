import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Property } from '../property/entities/property.entity';
import { PropertyView } from './entities/property-view.entity';
import { PropertyViewController } from './property-view.controller';
import { PropertyViewService } from './property-view.service';

@Module({
  imports: [TypeOrmModule.forFeature([PropertyView, Property])],
  controllers: [PropertyViewController],
  providers: [PropertyViewService],
})
export class PropertyViewModule {}
