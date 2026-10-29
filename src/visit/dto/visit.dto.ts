import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsISO8601, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HALF_HOUR = /^([01]\d|2[0-3]):(00|30)$/;

export class CreateVisitDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  propertyId!: number;

  /** Inicio de la cita, en ISO 8601 (UTC). */
  @IsISO8601({ strict: true })
  scheduledAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ProposeVisitDto {
  @IsISO8601({ strict: true })
  scheduledAt!: string;
}

export class CancelVisitDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class SlotsQueryDto {
  @Matches(DATE)
  from!: string;

  @Matches(DATE)
  to!: string;
}

export class AvailabilityRuleDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  weekday!: number;

  @Matches(HALF_HOUR)
  start!: string;

  @Matches(HALF_HOUR)
  end!: string;
}

export class SetAvailabilityDto {
  @IsString()
  @MaxLength(64)
  timezone!: string;

  @IsArray()
  @ArrayMaxSize(28)
  @ValidateNested({ each: true })
  @Type(() => AvailabilityRuleDto)
  rules!: AvailabilityRuleDto[];

  /** Confirmar al instante las citas que se pidan. */
  @IsOptional()
  @IsBoolean()
  autoConfirm?: boolean;
}
