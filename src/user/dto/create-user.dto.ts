import { Type } from "class-transformer";
import { IsNotEmpty, IsString, MaxLength, IsOptional, IsEmail, Matches, IsDate, Length, IsBoolean } from "class-validator";


export class CreateUserDto {
    @IsNotEmpty({
    message: 'The identification card is required.',
  })
  @IsString({
    message: 'The identification card must be a string.',
  })
  @MaxLength(30, {
    message: 'The identification card cannot exceed 30 characters.',
  })
  idCard!: string;

  @IsNotEmpty({
    message: 'The name is required.',
  })
  @IsString({
    message: 'The name must be a string.',
  })
  @MaxLength(200, {
    message: 'The name cannot exceed 200 characters.',
  })
  name!: string;

  @IsNotEmpty({
    message: 'The first surname is required.',
  })
  @IsString({
    message: 'The first surname must be a string.',
  })
  @MaxLength(100, {
    message: 'The first surname cannot exceed 100 characters.',
  })
  surname1!: string;

  @IsOptional()
  @IsString({
    message: 'The second surname must be a string.',
  })
  @MaxLength(100, {
    message: 'The second surname cannot exceed 100 characters.',
  })
  surname2?: string;

  @IsNotEmpty({
    message: 'The email is required.',
  })
  @IsEmail(
    {},
    {
      message: 'The email must be a valid email address.',
    },
  )
  @MaxLength(150, {
    message: 'The email cannot exceed 150 characters.',
  })
  email!: string;

  @IsNotEmpty({
    message: 'The phone number is required.',
  })
  @IsString({
    message: 'The phone number must be a string.',
  })
  @MaxLength(20, {
    message: 'The phone number cannot exceed 20 characters.',
  })
  @Matches(/^\+?[0-9]{8,20}$/, {
    message:
      'The phone number must contain between 8 and 20 digits and may start with +.',
  })
  phoneNumber!: string;

  @IsNotEmpty({
    message: 'The birthdate is required.',
  })
  @Type(() => Date)
  @IsDate({
    message: 'The birthdate must be a valid date.',
  })
  birthdate!: Date;

  @IsNotEmpty({
    message: 'The password is required.',
  })
  @IsString({
    message: 'The password must be a string.',
  })
  @Length(8, 255, {
    message: 'The password must contain between 8 and 255 characters.',
  })
  @Matches(/[A-Z]/, {
    message: 'The password must contain at least one uppercase letter.',
  })
  @Matches(/[a-z]/, {
    message: 'The password must contain at least one lowercase letter.',
  })
  @Matches(/[0-9]/, {
    message: 'The password must contain at least one number.',
  })
  @Matches(/[!@#$%^&*(),.?":{}|<>]/, {
    message: 'The password must contain at least one special character.',
  })
  password!: string;
}