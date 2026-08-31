import { Type } from "class-transformer";
import {
    IsNotEmpty,
    IsString,
    MaxLength,
    IsNumber,
    IsOptional,
    IsInt,
    Min,
    IsArray,
    ArrayMinSize,
} from "class-validator";

export class CreatePropertyDto {
    @IsNotEmpty({
        message: 'The title is required.',
    })
    @IsString({
        message: 'The title must be a string.',
    })
    @MaxLength(200, {
        message: 'The title cannot exceed 200 characters.',
    })
    title!: string;

    @IsNotEmpty({
        message: 'The description is required.',
    })
    @IsString({
        message: 'The description must be a string.',
    })
    description!: string;

    @IsNotEmpty({
        message: 'The cost is required.',
    })
    @IsNumber({}, {
        message: 'The cost must be a number.',
    })
    @Min(0, {
        message: 'The cost must be a positive number.',
    })
    @Type(() => Number)
    cost!: number;

    @IsOptional()
    @IsString({
        message: 'The type of coin must be a string.',
    })
    @MaxLength(10, {
        message: 'The type of coin cannot exceed 10 characters.',
    })
    typeOfCoin?: string;

    @IsNotEmpty({
        message: 'The address is required.',
    })
    @IsString({
        message: 'The address must be a string.',
    })
    @MaxLength(300, {
        message: 'The address cannot exceed 300 characters.',
    })
    address!: string;

    @IsOptional()
    @IsInt({
        message: 'The guest capacity must be an integer.',
    })
    @Min(1, {
        message: 'The guest capacity must be at least 1.',
    })
    @Type(() => Number)
    guest?: number;

    @IsOptional()
    @IsInt({
        message: 'The number of rooms must be an integer.',
    })
    @Min(1, {
        message: 'The number of rooms must be at least 1.',
    })
    @Type(() => Number)
    rooms?: number;

    @IsNotEmpty({
        message: 'The owner ID is required.',
    })
    @IsInt({
        message: 'The owner ID must be an integer.',
    })
    @Type(() => Number)
    ownerId!: number;

    @IsOptional()
    @IsInt({
        message: 'The type of property ID must be an integer.',
    })
    @Type(() => Number)
    typeOfPropertyId?: number;

    @IsOptional()
    @IsArray({
        message: 'The service IDs must be an array.',
    })
    @IsInt({ each: true, message: 'Each service ID must be an integer.' })
    serviceIds?: number[];
}
