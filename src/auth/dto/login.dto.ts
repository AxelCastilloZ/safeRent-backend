import { IsNotEmpty, IsEmail, MaxLength, IsString } from "class-validator";

export class LoginDto {
    @IsNotEmpty({
      message: 'The email is required.',
    })
    @IsEmail(
      {},
      {
        message: 'The email must be a valid email address.',
      },
    )
    email!: string;

    @IsNotEmpty({
      message: 'The password is required.',
    })
    @IsString({
      message: 'The password must be a string.',
    })
    password!: string;
}
