import { Transform, Type } from 'class-transformer';
import { IsDefined, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { CatalogTranslationsDto } from '../../common/catalog-translations.dto';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateServiceDto {
  @IsDefined()
  @ValidateNested()
  @Type(() => CatalogTranslationsDto)
  translations?: CatalogTranslationsDto;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  icono?: string | null;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string | null;
}
