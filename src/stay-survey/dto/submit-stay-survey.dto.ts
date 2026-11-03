import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';

const emptyToNull = ({ value }: { value: unknown }) => (value === '' ? null : value);

export class SubmitStaySurveyDto {
  @IsInt()
  @Min(1)
  @Max(5)
  waterStability!: number;

  @IsInt()
  @Min(1)
  @Max(5)
  electricityStability!: number;

  @IsInt()
  @Min(0)
  @Max(10000)
  internetMbps!: number;

  @IsOptional()
  @Transform(emptyToNull)
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 1 })
  @Min(0)
  @Max(500)
  universityKm?: number | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 1 })
  @Min(0)
  @Max(500)
  coworkingKm?: number | null;

  @IsBoolean()
  hasWorkArea!: boolean;
}
