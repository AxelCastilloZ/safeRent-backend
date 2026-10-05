import { IsIn, IsNotEmpty, IsString, MaxLength, ValidateIf } from 'class-validator';
import { PropertyStatus, REVIEWABLE_PROPERTY_STATUSES } from '../property-status.enum';

/**
 * Cuerpo de `PATCH /properties/:id/review` (solo ADMIN). `note` es obligatoria salvo que
 * el estado sea ACTIVE, para que el propietario sepa qué revisar o por qué se rechazó.
 */
export class ReviewPropertyDto {
    @IsIn(REVIEWABLE_PROPERTY_STATUSES, {
        message: 'El estado debe ser ACTIVE, CHANGES_REQUESTED o INACTIVE.',
    })
    status!: PropertyStatus.ACTIVE | PropertyStatus.CHANGES_REQUESTED | PropertyStatus.INACTIVE;

    @ValidateIf((dto: ReviewPropertyDto) => dto.status !== PropertyStatus.ACTIVE)
    @IsNotEmpty({
        message: 'Explica al propietario qué debe corregir o por qué se rechaza la propiedad.',
    })
    @IsString({
        message: 'La nota de revisión debe ser un texto.',
    })
    @MaxLength(500, {
        message: 'La nota de revisión no puede superar 500 caracteres.',
    })
    note?: string;
}
