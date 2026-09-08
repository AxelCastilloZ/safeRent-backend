import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Service } from '../property/entities/service.entity';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

@Injectable()
export class ServiceService {
    constructor(
        @InjectRepository(Service)
        private readonly serviceRepo: Repository<Service>,
    ) {}

    async create(createServiceDto: CreateServiceDto) {
        const newService = this.serviceRepo.create(createServiceDto);
        return await this.serviceRepo.save(newService);
    }

    async findAll() {
        const services = await this.serviceRepo.find();
        if (services.length === 0) {
            throw new NotFoundException('No services found');
        }
        return services;
    }

    async findOne(id: number) {
        const service = await this.serviceRepo.findOneBy({ id });
        if (!service) {
            throw new NotFoundException(`Service with Id ${id} not found`);
        }
        return service;
    }

    async update(id: number, updateServiceDto: UpdateServiceDto) {
        await this.serviceRepo.update(id, updateServiceDto);
        return await this.findOne(id);
    }

    async remove(id: number) {
        const service = await this.findOne(id);
        return await this.serviceRepo.remove(service);
    }
}
