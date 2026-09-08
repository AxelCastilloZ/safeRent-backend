import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { TypeOfPropertyService } from './type-of-property.service';
import { CreateTypeOfPropertyDto } from './dto/create-type-of-property.dto';
import { UpdateTypeOfPropertyDto } from './dto/update-type-of-property.dto';

@Controller('type-of-property')
export class TypeOfPropertyController {
    constructor(private readonly typeOfPropertyService: TypeOfPropertyService) {}

    @Post()
    create(@Body() createTypeOfPropertyDto: CreateTypeOfPropertyDto) {
        return this.typeOfPropertyService.create(createTypeOfPropertyDto);
    }

    @Get()
    findAll() {
        return this.typeOfPropertyService.findAll();
    }

    @Get(':id')
    findOne(@Param('id') id: number) {
        return this.typeOfPropertyService.findOne(id);
    }

    @Patch(':id')
    update(@Param('id') id: number, @Body() updateTypeOfPropertyDto: UpdateTypeOfPropertyDto) {
        return this.typeOfPropertyService.update(id, updateTypeOfPropertyDto);
    }

    @Delete(':id')
    remove(@Param('id') id: number) {
        return this.typeOfPropertyService.remove(id);
    }
}
