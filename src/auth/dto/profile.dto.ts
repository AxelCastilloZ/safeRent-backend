import { Transform } from 'class-transformer';
import { PickType } from '@nestjs/mapped-types';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  PROFILE_COUNTRY_CODES,
  PROFILE_CURRENCY_CODES,
} from '../../currency/profile-currency';
import { CreateUserDto } from '../../user/dto/create-user.dto';
import { RegisterDto } from './register.dto';

export class UpdateProfileDto extends PickType(CreateUserDto, [
  'name',
  'surname1',
  'surname2',
  'email',
  'phoneNumber',
  'birthdate',
] as const) {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  name!: string;
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  surname1!: string;
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  surname2?: string;
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  email!: string;
  @IsOptional()
  @IsString()
  @MaxLength(255)
  currentPassword?: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsOptional()
  @IsString()
  @IsIn(PROFILE_COUNTRY_CODES)
  countryCode?: string | null;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsOptional()
  @IsString()
  @IsIn(PROFILE_CURRENCY_CODES)
  preferredCurrency?: string | null;
}
export class ChangePasswordDto extends PickType(RegisterDto, [
  'password',
] as const) {
  @IsString()
  @MaxLength(255)
  currentPassword!: string;
}
