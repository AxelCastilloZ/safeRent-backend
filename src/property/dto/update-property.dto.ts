import { PartialType } from '@nestjs/mapped-types';
import { CreatePropertyDto } from './create-property.dto';

/**
 * No incluye `status`/`isActive`: el estado de una propiedad solo cambia a través de
 * `PropertyService.publish()` (propietario) o `PropertyService.review()` (administrador).
 */
export class UpdatePropertyDto extends PartialType(CreatePropertyDto) {}
