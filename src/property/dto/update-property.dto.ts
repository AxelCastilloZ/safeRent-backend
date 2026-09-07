import { PartialType } from '@nestjs/mapped-types';
import { CreatePropertyDto } from './create-property.dto';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdatePropertyDto extends PartialType(CreatePropertyDto) {
    @IsOptional()
    @IsBoolean({
        message: 'isActive must be a boolean value.',
    })
    isActive?: boolean;
}
