import { PartialType } from '@nestjs/mapped-types';
import { CreateTypeOfPropertyDto } from './create-type-of-property.dto';

export class UpdateTypeOfPropertyDto extends PartialType(CreateTypeOfPropertyDto) {}
