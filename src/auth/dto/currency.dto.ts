import { IsIn, IsString } from 'class-validator';
import { PROFILE_CURRENCY_CODES } from '../../currency/profile-currency';

export class UpdateCurrencyDto {
  @IsString()
  @IsIn(PROFILE_CURRENCY_CODES)
  preferredCurrency!: string;
}
