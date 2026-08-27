import { Injectable } from '@nestjs/common';
import { CreateIconDescriptionDto } from './dto/create-icon-description.dto';
import { UpdateIconDescriptionDto } from './dto/update-icon-description.dto';

@Injectable()
export class IconDescriptionService {
  create(createIconDescriptionDto: CreateIconDescriptionDto) {
    return 'This action adds a new iconDescription';
  }

  findAll() {
    return `This action returns all iconDescription`;
  }

  findOne(id: number) {
    return `This action returns a #${id} iconDescription`;
  }

  update(id: number, updateIconDescriptionDto: UpdateIconDescriptionDto) {
    return `This action updates a #${id} iconDescription`;
  }

  remove(id: number) {
    return `This action removes a #${id} iconDescription`;
  }
}
