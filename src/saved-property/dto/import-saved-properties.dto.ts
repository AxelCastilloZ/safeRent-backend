import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsInt, Min } from 'class-validator';

/** Ids de propiedades que el inquilino ya tenía guardadas en su navegador (importación de una sola vez). */
export class ImportSavedPropertiesDto {
  @IsArray({ message: 'The property IDs must be an array.' })
  @ArrayMaxSize(100, { message: 'You can import at most 100 properties at once.' })
  @ArrayUnique({ message: 'The property IDs must be different.' })
  @IsInt({ each: true, message: 'Each property ID must be an integer.' })
  @Min(1, { each: true, message: 'Each property ID must be positive.' })
  @Type(() => Number)
  propertyIds!: number[];
}
