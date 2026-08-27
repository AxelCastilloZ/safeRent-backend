import { PartialType } from '@nestjs/mapped-types';
import { CreateIconDescriptionDto } from './create-icon-description.dto';

export class UpdateIconDescriptionDto extends PartialType(CreateIconDescriptionDto) {}
