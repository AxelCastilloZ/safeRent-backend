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
import { LocationService } from './location.service';
import { UserModule } from '../user/user.module';
import { CurrencyModule } from '../currency/currency.module';
import { PropertyPricingService } from './property-pricing.service';

@Module({
    imports: [
        ServiceModule,
        UserModule,
        CurrencyModule,
        TypeOrmModule.forFeature([
            Property,
            TypeOfProperty,
            PropertyFile,
            IconDescription,
            User,
        ]),
    ],
    controllers: [PropertyController],
    providers: [PropertyService, LocationService, PropertyPricingService],
    // PropertyPricingService: lo usan otros módulos (p. ej. las guardadas) para mostrar el precio en la moneda del usuario.
    exports: [PropertyService, PropertyPricingService],
})
export class PropertyModule {}
