import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PROFILE_CURRENCY_CODES } from '../../currency/profile-currency';

export class FindPropertiesDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === undefined || value === null) {
      return undefined;
    }

    const values: unknown[] = Array.isArray(value) ? value : [value];

    return values
      .flatMap((item) => (typeof item === 'string' ? item.split(',') : [item]))
      .map((item) =>
        typeof item === 'string'
          ? /^\d+$/.test(item.trim()) ? Number(item.trim()) : NaN
          : item,
      );
  })
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(2147483647, { each: true })
  serviceIds?: number[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  typeOfPropertyId?: number;

  /** Solo las propiedades de este propietario (la página pública del propietario). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2147483647)
  @Type(() => Number)
  ownerId?: number;

  @IsOptional()
  @Min(0)
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 6 })
  @Type(() => Number)
  minPrice?: number;

  @IsOptional()
  @Min(0)
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 6 })
  @Type(() => Number)
  maxPrice?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  minRooms?: number;

  // Filtros del entorno: se calculan con el promedio de las encuestas que responden los inquilinos al terminar su estadía.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  @Type(() => Number)
  minWaterStability?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  @Type(() => Number)
  minElectricityStability?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  @Type(() => Number)
  minInternetMbps?: number;

  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 1 })
  @Min(0)
  @Max(500)
  @Type(() => Number)
  maxUniversityKm?: number;

  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 1 })
  @Min(0)
  @Max(500)
  @Type(() => Number)
  maxCoworkingKm?: number;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (value === 'true' || value === true ? true : value === 'false' || value === false ? false : value))
  @IsBoolean()
  hasWorkArea?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsIn(PROFILE_CURRENCY_CODES)
  displayCurrency?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsIn(PROFILE_CURRENCY_CODES)
  sourceCurrency?: string;

  @IsOptional()
  @IsIn(['newest', 'price_asc', 'price_desc'])
  sort?: 'newest' | 'price_asc' | 'price_desc';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2147483647)
  rateBatchId?: number;
}
