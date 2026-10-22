import { Type } from "class-transformer";
import { IsInt, IsNotEmpty, Min } from "class-validator";

/** Un administrador inicia (o retoma) una conversación directa con un usuario. */
export class CreateDirectConversationDto {
    @IsNotEmpty({
        message: 'The user ID is required.',
    })
    @IsInt({
        message: 'The user ID must be an integer.',
    })
    @Min(1, {
        message: 'The user ID must be positive.',
    })
    @Type(() => Number)
    userId!: number;
}
