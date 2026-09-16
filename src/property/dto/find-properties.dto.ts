import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsInt,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

export class FindPropertiesDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(({ value }: { value: unknown }) => {
    const values = Array.isArray(value) ? (value as unknown[]) : [value];
    return values
      .flatMap((item) => (typeof item === 'string' ? item.split(',') : [item]))
      .map((item: unknown) =>
        typeof item === 'string' && /^[1-9]\d*$/.test(item.trim())
          ? Number(item.trim())
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
}
