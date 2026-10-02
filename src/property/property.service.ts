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
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as fs from 'fs';

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
            address: rest.address ?? '',
            owner,
            typeOfProperty,
            services,
            isActive: false,
        });

        return await this.propertyRepo.save(newProperty);
    }

    async findAll(dto: FindPropertiesDto = {}) {
        const {
            serviceIds = [],
            typeOfPropertyId,
            minPrice,
            maxPrice,
            search,
            minRooms,
            page = 1,
            limit = 20,
        } = dto;

        const query = this.propertyRepo.createQueryBuilder('property')
            .leftJoinAndSelect('property.typeOfProperty', 'typeOfProperty')
            .leftJoinAndSelect('property.services', 'services')
            .leftJoinAndSelect('property.files', 'files')
            .leftJoinAndSelect('property.iconDescriptions', 'iconDescriptions')
            .where('property.isActive = :isActive', { isActive: true });

        if (typeOfPropertyId) {
            query.andWhere('typeOfProperty.id = :typeOfPropertyId', { typeOfPropertyId });
        }

        if (minPrice !== undefined) {
            query.andWhere('property.cost >= :minPrice', { minPrice });
        }

        if (maxPrice !== undefined) {
            query.andWhere('property.cost <= :maxPrice', { maxPrice });
        }

        if (search) {
            query.andWhere(
                '(LOWER(property.title) LIKE :search OR LOWER(property.address) LIKE :search)',
                { search: `%${search.toLowerCase()}%` },
            );
        }

        if (minRooms) {
            query.andWhere('property.rooms >= :minRooms', { minRooms });
        }

        [...new Set(serviceIds)].forEach((id, index) => {
            const alias = `selectedService${index}`;
            query.innerJoin('property.services', alias, `${alias}.id = :serviceId${index}`, { [`serviceId${index}`]: id });
        });

        const [data, total] = await query
            .orderBy('property.id', 'DESC')
            .skip((page - 1) * limit)
            .take(limit)
            .getManyAndCount();

        return {
            data,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }

    async findAllTypes() {
        return this.typeOfPropertyRepo.find({ order: { name: 'ASC' } });
    }

    async findPublic(id: number) {
        const property = await this.propertyRepo.findOne({
            where: { id, isActive: true },
            relations: { files: true, iconDescriptions: true },
        });
        if (!property) throw new NotFoundException('Propiedad no disponible');
        return {
            id: property.id, title: property.title, description: property.description,
            address: property.address, cost: property.cost, typeOfCoin: property.typeOfCoin,
            rooms: property.rooms, guest: property.guest,
            latitude: property.latitude, longitude: property.longitude,
            typeOfProperty: property.typeOfProperty,
            services: property.services, iconDescriptions: property.iconDescriptions,
            files: property.files.map(({ path, mimeType }) => ({ path, mimeType })),
            owner: { id: property.owner.id, name: property.owner.name },
        };
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

        if (property.isActive) this.validateLocation(property);

        return await this.propertyRepo.save(property);
    }

    async publish(id: number) {
        const property = await this.findOne(id);
        this.validateLocation(property);
        property.isActive = true;
        return await this.propertyRepo.save(property);
    }

    private validateLocation(property: Property) {
        if (!property.address?.trim() || property.address.length > 300 ||
            !Number.isFinite(property.latitude) || !Number.isFinite(property.longitude) ||
            Math.abs(property.latitude!) > 90 || Math.abs(property.longitude!) > 180) {
            throw new BadRequestException('Completa la dirección y confirma la ubicación en el mapa antes de publicar.');
        }
    }

    async remove(id: number) {
        const property = await this.findOne(id);
        property.isActive = false;
        return await this.propertyRepo.save(property);
    }

    async findActive(query: FindPropertiesDto = {}) {
        return this.findAll(query);
    }

    // --- File methods ---

    async saveFiles(propertyId: number, files: Express.Multer.File[]) {
        const property = await this.findOne(propertyId);

        const propertyFiles = files.map((file) =>
            this.propertyFileRepo.create({
                path: file.path,
                fileName: file.originalname,
                mimeType: file.mimetype,
                size: file.size,
                uploadedBy: property.owner?.name ?? 'unknown',
                property,
            }),
        );

        return await this.propertyFileRepo.save(propertyFiles);
    }

    async getFiles(propertyId: number) {
        await this.findOne(propertyId);

        return await this.propertyFileRepo.find({
            where: { property: { id: propertyId } },
        });
    }

    async removeFile(propertyId: number, fileId: number) {
        await this.findOne(propertyId);

        const file = await this.propertyFileRepo.findOne({
            where: { id: fileId, property: { id: propertyId } },
        });

        if (!file) {
            throw new NotFoundException(`File with Id ${fileId} not found for property ${propertyId}`);
        }

        if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
        }

        return await this.propertyFileRepo.remove(file);
    }
}
