import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { PropertyService } from './property.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';

@Controller('properties')
export class PropertyController {
    constructor(private readonly propertyService: PropertyService) {}

    @Post()
    create(@Body() createPropertyDto: CreatePropertyDto) {
        return this.propertyService.create(createPropertyDto);
    }

    @Get()
    findAll() {
        return this.propertyService.findAll();
    }

    @Get(':id')
    findOne(@Param('id') id: number) {
        return this.propertyService.findOne(id);
    }

    @Get('owner/:ownerId')
    findByOwner(@Param('ownerId') ownerId: number) {
        return this.propertyService.findByOwner(ownerId);
    }

    @Patch(':id')
    update(@Param('id') id: number, @Body() updatePropertyDto: UpdatePropertyDto) {
        return this.propertyService.update(id, updatePropertyDto);
    }

    @Patch(':id/publish')
    publish(@Param('id') id: number) {
        return this.propertyService.publish(id);
    }

    @Delete(':id')
    remove(@Param('id') id: number) {
        return this.propertyService.remove(id);
    }
}
