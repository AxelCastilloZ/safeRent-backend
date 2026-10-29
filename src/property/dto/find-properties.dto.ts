import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
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
