import { Type } from "class-transformer";
import {
    ArrayMaxSize,
    ArrayMinSize,
    ArrayUnique,
    IsArray,
    IsInt,
    IsNotEmpty,
    Min,
} from "class-validator";

export class CreateConversationDto {
    @IsNotEmpty({
        message: 'The participant IDs are required.',
    })
    @IsArray({
        message: 'The participant IDs must be an array.',
    })
    @ArrayMinSize(2, {
        message: 'The conversation must have exactly 2 participants.',
    })
    @ArrayMaxSize(2, {
        message: 'The conversation must have exactly 2 participants.',
    })
    @ArrayUnique({
        message: 'The participants must be different users.',
    })
    @IsInt({ each: true, message: 'Each participant ID must be an integer.' })
    @Min(1, { each: true, message: 'Each participant ID must be positive.' })
    @Type(() => Number)
    participantIds!: number[];

    @IsNotEmpty({
        message: 'The property ID is required.',
    })
    @IsInt({
        message: 'The property ID must be an integer.',
    })
    @Min(1, {
        message: 'The property ID must be positive.',
    })
    @Type(() => Number)
    propertyId!: number;
}
