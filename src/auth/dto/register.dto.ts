import { OmitType } from '@nestjs/mapped-types';
import { IsString, Length, Matches, IsByteLength } from 'class-validator';
import { CreateUserDto } from '../../user/dto/create-user.dto';

export class RegisterDto extends OmitType(CreateUserDto, ['roleId', 'password'] as const) {
  // bcrypt only uses the first 72 bytes of a password.
  @IsString()
  @Length(8, 72)
  @Matches(/[A-Z]/)
  @Matches(/[a-z]/)
  @Matches(/[0-9]/)
  @Matches(/[!@#$%^&*(),.?":{}|<>]/)
  @IsByteLength(0, 72)
  password!: string;
}
