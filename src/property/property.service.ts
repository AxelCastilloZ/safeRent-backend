import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Property } from './entities/property.entity';
import { TypeOfProperty } from './entities/type-of-property.entity';
import { Service } from './entities/service.entity';
import { PropertyFile } from './entities/property-file.entity';
import { IconDescription } from './entities/icon-description.entity';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { User } from '../user/entities/user.entity';

@Injectable()
export class PropertyService {
    constructor(
        @InjectRepository(Property)
        private readonly propertyRepo: Repository<Property>,

        @InjectRepository(TypeOfProperty)
        private readonly typeOfPropertyRepo: Repository<TypeOfProperty>,

        @InjectRepository(Service)
        private readonly serviceRepo: Repository<Service>,

        @InjectRepository(PropertyFile)
        private readonly propertyFileRepo: Repository<PropertyFile>,

        @InjectRepository(IconDescription)
        private readonly iconDescriptionRepo: Repository<IconDescription>,

        @InjectRepository(User)
        private readonly userRepo: Repository<User>,
    ) {}

    async create(createPropertyDto: CreatePropertyDto) {
        const { ownerId, typeOfPropertyId, serviceIds, ...rest } = createPropertyDto;

        const owner = await this.userRepo.findOneBy({ id: ownerId });
        if (!owner) {
            throw new NotFoundException(`User with Id ${ownerId} not found`);
        }

        let typeOfProperty: TypeOfProperty | undefined;
        if (typeOfPropertyId) {
            const found = await this.typeOfPropertyRepo.findOneBy({ id: typeOfPropertyId });
            if (!found) {
                throw new NotFoundException(`TypeOfProperty with Id ${typeOfPropertyId} not found`);
            }
            typeOfProperty = found;
        }

        let services: Service[] = [];
        if (serviceIds && serviceIds.length > 0) {
            services = await this.serviceRepo.findBy({ id: In(serviceIds) });
            if (services.length !== serviceIds.length) {
                throw new NotFoundException('One or more services were not found');
            }
        }

        const newProperty = this.propertyRepo.create({
            ...rest,
            owner,
            typeOfProperty,
            services,
            isActive: false,
        });

        return await this.propertyRepo.save(newProperty);
    }

    async findAll() {
        const properties = await this.propertyRepo.find({
            where: { isActive: true },
            relations: { files: true, iconDescriptions: true },
        });

        if (properties.length === 0) {
            throw new NotFoundException('No properties found');
        }

        return properties;
    }

    async findOne(id: number) {
        const property = await this.propertyRepo.findOne({
            where: { id },
            relations: { files: true, iconDescriptions: true },
        });

        if (!property) {
            throw new NotFoundException(`Property with Id ${id} not found`);
        }

        return property;
    }

    async findByOwner(ownerId: number) {
        const owner = await this.userRepo.findOneBy({ id: ownerId });
        if (!owner) {
            throw new NotFoundException(`User with Id ${ownerId} not found`);
        }

        return await this.propertyRepo.find({
            where: { owner: { id: ownerId } },
            relations: { files: true, iconDescriptions: true },
        });
    }

    async update(id: number, updatePropertyDto: UpdatePropertyDto) {
        const property = await this.findOne(id);

        const { ownerId, typeOfPropertyId, serviceIds, ...rest } = updatePropertyDto;

        if (ownerId) {
            const owner = await this.userRepo.findOneBy({ id: ownerId });
            if (!owner) {
                throw new NotFoundException(`User with Id ${ownerId} not found`);
            }
            property.owner = owner;
        }

        if (typeOfPropertyId) {
            const typeOfProperty = await this.typeOfPropertyRepo.findOneBy({ id: typeOfPropertyId });
            if (!typeOfProperty) {
                throw new NotFoundException(`TypeOfProperty with Id ${typeOfPropertyId} not found`);
            }
            property.typeOfProperty = typeOfProperty;
        }

        if (serviceIds) {
            const services = await this.serviceRepo.findBy({ id: In(serviceIds) });
            if (services.length !== serviceIds.length) {
                throw new NotFoundException('One or more services were not found');
            }
            property.services = services;
        }

        Object.assign(property, rest);

        return await this.propertyRepo.save(property);
    }

    async publish(id: number) {
        const property = await this.findOne(id);
        property.isActive = true;
        return await this.propertyRepo.save(property);
    }

    async remove(id: number) {
        const property = await this.findOne(id);
        property.isActive = false;
        return await this.propertyRepo.save(property);
    }

    async findActive() {
    return await this.propertyRepo.find({
        where: {
            isActive: true,
        },
    });
}
}
