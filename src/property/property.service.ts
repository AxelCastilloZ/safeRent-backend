import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Property } from './entities/property.entity';
import { TypeOfProperty } from './entities/type-of-property.entity';
import { ServiceService } from '../service/service.service';
import { PropertyFile } from './entities/property-file.entity';
import { IconDescription } from './entities/icon-description.entity';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { User } from '../user/entities/user.entity';
import { FindPropertiesDto } from './dto/find-properties.dto';

@Injectable()
export class PropertyService {
    constructor(
        @InjectRepository(Property)
        private readonly propertyRepo: Repository<Property>,

        @InjectRepository(TypeOfProperty)
        private readonly typeOfPropertyRepo: Repository<TypeOfProperty>,

        private readonly serviceService: ServiceService,

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

        const services = await this.serviceService.findByIds(serviceIds ?? []);

        const newProperty = this.propertyRepo.create({
            ...rest,
            owner,
            typeOfProperty,
            services,
            isActive: false,
        });

        return await this.propertyRepo.save(newProperty);
    }

    async findAll({ serviceIds = [] }: FindPropertiesDto = {}) {
        const query = this.propertyRepo.createQueryBuilder('property')
            .leftJoinAndSelect('property.owner', 'owner')
            .leftJoinAndSelect('property.typeOfProperty', 'typeOfProperty')
            .leftJoinAndSelect('property.services', 'services')
            .leftJoinAndSelect('property.files', 'files')
            .leftJoinAndSelect('property.iconDescriptions', 'iconDescriptions')
            .where('property.isActive = :isActive', { isActive: true });

        // Independent joins implement ALL selected services, while the services
        // relation above still returns every amenity of each matching property.
        [...new Set(serviceIds)].forEach((id, index) => {
            const alias = `selectedService${index}`;
            query.innerJoin('property.services', alias, `${alias}.id = :serviceId${index}`, { [`serviceId${index}`]: id });
        });

        return query.orderBy('property.id', 'DESC').getMany();
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
            property.services = await this.serviceService.findByIds(serviceIds);
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

    async findActive(query: FindPropertiesDto = {}) {
        return this.findAll(query);
    }
}
