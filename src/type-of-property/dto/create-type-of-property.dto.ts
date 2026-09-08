import {
    IsNotEmpty,
    IsString,
    MaxLength,
    IsOptional,
} from "class-validator";

export class CreateTypeOfPropertyDto {
    @IsNotEmpty({
        message: 'The name is required.',
    })
    @IsString({
        message: 'The name must be a string.',
    })
    @MaxLength(100, {
        message: 'The name cannot exceed 100 characters.',
    })
    name!: string;

    @IsOptional()
    @IsString({
        message: 'The description must be a string.',
    })
    @MaxLength(255, {
        message: 'The description cannot exceed 255 characters.',
    })
    description?: string;

    @IsOptional()
    @IsString({
        message: 'The icon must be a string.',
    })
    @MaxLength(100, {
        message: 'The icon cannot exceed 100 characters.',
    })
    icon?: string;
}
