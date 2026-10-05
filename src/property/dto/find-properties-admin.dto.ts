import { IsEnum, IsOptional } from 'class-validator';
import { FindPropertiesDto } from './find-properties.dto';
import { PropertyStatus } from '../property-status.enum';

/** Filtros de `GET /properties/admin/all`: lo mismo que `FindPropertiesDto` más el estado de revisión. */
export class FindPropertiesAdminDto extends FindPropertiesDto {
    @IsOptional()
    @IsEnum(PropertyStatus, {
        message: 'El estado debe ser DRAFT, PENDING, ACTIVE, CHANGES_REQUESTED o INACTIVE.',
    })
    status?: PropertyStatus;
}
