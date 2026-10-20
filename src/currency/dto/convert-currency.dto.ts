import { Transform, type TransformFnParams } from 'class-transformer';
import { IsString, Matches } from 'class-validator';
import { MONEY_AMOUNT_PATTERN } from '../currency-metadata';

const normalizeCode = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class ConvertCurrencyDto {
  @IsString()
  @Matches(MONEY_AMOUNT_PATTERN)
  amount!: string;

  @Transform(normalizeCode)
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  from!: string;

  @Transform(normalizeCode)
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  to!: string;
}
