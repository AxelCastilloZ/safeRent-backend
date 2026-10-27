import { Transform, Type } from 'class-transformer';
import { IsDefined, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

export class CatalogTextDto {
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(255)
  description?: string | null;
}

export class CatalogTranslationsDto {
  @IsDefined() @ValidateNested() @Type(() => CatalogTextDto)
  es?: CatalogTextDto;
  @IsDefined() @ValidateNested() @Type(() => CatalogTextDto)
  en?: CatalogTextDto;
  @IsDefined() @ValidateNested() @Type(() => CatalogTextDto)
  fr?: CatalogTextDto;
  @IsDefined() @ValidateNested() @Type(() => CatalogTextDto)
  pt?: CatalogTextDto;
}
