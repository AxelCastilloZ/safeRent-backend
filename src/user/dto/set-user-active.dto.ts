import { IsBoolean, IsNotEmpty } from 'class-validator';

/** Cuerpo de `PATCH /users/:id/status`. */
export class SetUserActiveDto {
    @IsNotEmpty({
        message: 'isActive is required.',
    })
    @IsBoolean({
        message: 'isActive must be a boolean value.',
    })
    isActive!: boolean;
}
