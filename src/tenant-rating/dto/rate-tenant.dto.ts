import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class RateTenantDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  /** Contexto opcional del puntaje (puntualidad en los pagos, cuidado de la propiedad…). Vacío = sin comentario. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(500)
  comment?: string;
}
