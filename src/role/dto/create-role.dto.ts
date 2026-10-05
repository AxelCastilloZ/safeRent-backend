import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class CreateRoleDto {
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
      message: 'The description is required.',
    })
    @IsString({
      message: 'The description must be a string.',
    })
    @MaxLength(100, {
      message: 'The description cannot exceed 100 characters.',
    })
    description!: string;
}
