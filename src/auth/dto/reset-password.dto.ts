import { PickType } from '@nestjs/mapped-types';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { RegisterDto } from './register.dto';

export class ResetPasswordDto extends PickType(RegisterDto, [
  'password',
] as const) {
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: 'El enlace es inválido o ha expirado. Solicita uno nuevo.',
  })
  token!: string;
}
