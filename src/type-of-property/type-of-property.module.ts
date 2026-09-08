import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TypeOfPropertyService } from './type-of-property.service';
import { TypeOfPropertyController } from './type-of-property.controller';
import { TypeOfProperty } from '../property/entities/type-of-property.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([TypeOfProperty]),
    ],
    controllers: [TypeOfPropertyController],
    providers: [TypeOfPropertyService],
    exports: [TypeOfPropertyService],
})
export class TypeOfPropertyModule {}
