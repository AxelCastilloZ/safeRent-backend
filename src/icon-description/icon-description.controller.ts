import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { IconDescriptionService } from './icon-description.service';
import { CreateIconDescriptionDto } from './dto/create-icon-description.dto';
import { UpdateIconDescriptionDto } from './dto/update-icon-description.dto';

@Controller('icon-description')
export class IconDescriptionController {
  constructor(private readonly iconDescriptionService: IconDescriptionService) {}

  @Post()
  create(@Body() createIconDescriptionDto: CreateIconDescriptionDto) {
    return this.iconDescriptionService.create(createIconDescriptionDto);
  }

  @Get()
  findAll() {
    return this.iconDescriptionService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.iconDescriptionService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateIconDescriptionDto: UpdateIconDescriptionDto) {
    return this.iconDescriptionService.update(+id, updateIconDescriptionDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.iconDescriptionService.remove(+id);
  }
}
