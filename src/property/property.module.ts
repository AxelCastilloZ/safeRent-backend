import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PropertyService } from './property.service';
import { PropertyController } from './property.controller';
import { Property } from './entities/property.entity';
import { TypeOfProperty } from './entities/type-of-property.entity';
import { ServiceModule } from '../service/service.module';
import { PropertyFile } from './entities/property-file.entity';
import { IconDescription } from './entities/icon-description.entity';
import { User } from '../user/entities/user.entity';

@Module({
    imports: [
        ServiceModule,
        TypeOrmModule.forFeature([
            Property,
            TypeOfProperty,
            PropertyFile,
            IconDescription,
            User,
        ]),
    ],
    controllers: [PropertyController],
    providers: [PropertyService],
    exports: [PropertyService],
})
export class PropertyModule {}
