import { Type } from "class-transformer";
import { IsInt, IsNotEmpty, IsString, Matches, MaxLength, Min } from "class-validator";

export class CreateMessageDto {
    @IsNotEmpty({
        message: 'The message is required.',
    })
    @IsString({
        message: 'The message must be a string.',
    })
    @Matches(/\S/, {
        message: 'The message cannot contain only spaces.',
    })
    @MaxLength(2000, {
        message: 'The message cannot exceed 2000 characters.',
    })
    message!: string;

    @IsNotEmpty({
        message: 'The sender ID is required.',
    })
    @IsInt({
        message: 'The sender ID must be an integer.',
    })
    @Min(1, {
        message: 'The sender ID must be positive.',
    })
    @Type(() => Number)
    senderId!: number;
}
