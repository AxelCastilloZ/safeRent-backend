import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TypeOfProperty } from '../property/entities/type-of-property.entity';
import { CreateTypeOfPropertyDto } from './dto/create-type-of-property.dto';
import { UpdateTypeOfPropertyDto } from './dto/update-type-of-property.dto';

@Injectable()
export class TypeOfPropertyService {
    constructor(
        @InjectRepository(TypeOfProperty)
        private readonly typeOfPropertyRepo: Repository<TypeOfProperty>,
    ) {}

    async create(createTypeOfPropertyDto: CreateTypeOfPropertyDto) {
        const newType = this.typeOfPropertyRepo.create(createTypeOfPropertyDto);
        return await this.typeOfPropertyRepo.save(newType);
    }

    async findAll() {
        const types = await this.typeOfPropertyRepo.find();
        if (types.length === 0) {
            throw new NotFoundException('No types of property found');
        }
        return types;
    }

    async findOne(id: number) {
        const type = await this.typeOfPropertyRepo.findOneBy({ id });
        if (!type) {
            throw new NotFoundException(`TypeOfProperty with Id ${id} not found`);
        }
        return type;
    }

    async update(id: number, updateTypeOfPropertyDto: UpdateTypeOfPropertyDto) {
        await this.typeOfPropertyRepo.update(id, updateTypeOfPropertyDto);
        return await this.findOne(id);
    }

    async remove(id: number) {
        const type = await this.findOne(id);
        return await this.typeOfPropertyRepo.remove(type);
    }
}
