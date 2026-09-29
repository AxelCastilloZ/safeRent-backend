import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export class FindPropertiesDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    const values = Array.isArray(value) ? value : [value];

    return values
      .flatMap((item) =>
        typeof item === 'string' ? item.split(',') : [item],
      )
      .map((item) =>
        typeof item === 'string' ? Number(item.trim()) : item,
      );
  })
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(2147483647, { each: true })
  serviceIds?: number[];
}