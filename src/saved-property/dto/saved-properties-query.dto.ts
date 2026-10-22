import { PickType } from '@nestjs/mapped-types';
import { FindPropertiesDto } from '../../property/dto/find-properties.dto';

/** Mismas opciones de moneda que el listado de propiedades, sin los filtros de búsqueda que aquí no aplican. */
export class SavedPropertiesQueryDto extends PickType(FindPropertiesDto, ['displayCurrency', 'rateBatchId'] as const) {}
