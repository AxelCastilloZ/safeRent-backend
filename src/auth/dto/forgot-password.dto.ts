import { Transform } from 'class-transformer';
import {
  IsString,
  MaxLength,
  MinLength,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  isEmail,
} from 'class-validator';

@ValidatorConstraint({ name: 'recoveryIdentifier', async: false })
class RecoveryIdentifier implements ValidatorConstraintInterface {
  validate(value: unknown) {
    return (
      typeof value === 'string' &&
      (value.includes('@') ? isEmail(value) : value.length <= 30)
    );
  }
  defaultMessage() {
    return 'Indica un correo válido o una cédula de hasta 30 caracteres.';
  }
}
export class ForgotPasswordDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  @Validate(RecoveryIdentifier)
  identifier!: string;
}
