import { DropboxService } from '../dropbox/dropbox.service';
import { resourceFolder } from '../dropbox/resource-folder';
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
import { FindPropertiesAdminDto } from './dto/find-properties-admin.dto';
import { ReviewPropertyDto } from './dto/review-property.dto';
import { PropertyStatus } from './property-status.enum';
import { UserService } from '../user/user.service';
import { AppRole } from '../auth/access';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as fs from 'fs';
import type { PropertyPriceContext } from './property-pricing.service';
import { currencyFractionDigits } from '../currency/currency-metadata';

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

        private readonly userService: UserService,
        private readonly dropbox: DropboxService = undefined!,
    ) {}

    async create(createPropertyDto: CreatePropertyDto) {
        const { ownerId, typeOfPropertyId, serviceIds, ...rest } = createPropertyDto;

        const owner = await this.userRepo.findOneBy({ id: ownerId });
        if (!owner) {
            throw new NotFoundException({ code: "API_USER_WITH_ID_NOT_FOUND", message: `User with Id ${ownerId} not found`, params: { v0: ownerId } });
        }

        let typeOfProperty: TypeOfProperty | undefined;
        if (typeOfPropertyId) {
            const found = await this.typeOfPropertyRepo.findOneBy({ id: typeOfPropertyId });
            if (!found) {
                throw new NotFoundException({ code: "API_TYPEOFPROPERTY_WITH_ID_NOT_FOUND", message: `TypeOfProperty with Id ${typeOfPropertyId} not found`, params: { v0: typeOfPropertyId } });
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
            status: PropertyStatus.DRAFT,
        });

        const saved = await this.propertyRepo.save(newProperty);


        return saved;
    }

    async findAll(dto: FindPropertiesDto = {}, pricing?: PropertyPriceContext) {
        const {
            serviceIds = [],
            typeOfPropertyId,
            ownerId,
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
            .where('property.status = :status', { status: PropertyStatus.ACTIVE });

        if (typeOfPropertyId) {
            query.andWhere('typeOfProperty.id = :typeOfPropertyId', { typeOfPropertyId });
        }

        if (ownerId) {
            query.andWhere('property.ownerId = :ownerId', { ownerId });
        }

        let priceExpression = 'property.cost';
        if (pricing) {
            const digits = currencyFractionDigits(pricing.currency) ?? 2;
            if (pricing.snapshot) {
                query.leftJoin('exchange_rates', 'price_rate', 'price_rate."batchId" = :priceBatchId AND price_rate."currencyCode" = UPPER(property."typeOfCoin")', { priceBatchId: pricing.snapshot.batchId });
                priceExpression = `ROUND(CASE WHEN UPPER(property."typeOfCoin") = :displayCurrency THEN property.cost ELSE (property.cost * CAST(:targetRate AS numeric))::numeric(100,60) / NULLIF(price_rate.rate, 0) END, ${digits})`;
                query.setParameter('targetRate', pricing.snapshot.rates[pricing.currency] ?? null);
            } else {
                priceExpression = `CASE WHEN UPPER(property."typeOfCoin") = :displayCurrency THEN ROUND(property.cost, ${digits}) ELSE NULL::numeric END`;
            }
            query.setParameter('displayCurrency', pricing.currency);
        }
        if (dto.sourceCurrency) query.andWhere('UPPER(property."typeOfCoin") = :sourceCurrency', { sourceCurrency: dto.sourceCurrency });

        if (minPrice !== undefined) {
            query.andWhere(`${priceExpression} >= :minPrice`, { minPrice });
        }

        if (maxPrice !== undefined) {
            query.andWhere(`${priceExpression} <= :maxPrice`, { maxPrice });
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

        if (pricing && dto.sort && dto.sort !== 'newest') {
            query.addSelect(priceExpression, 'display_cost').orderBy('display_cost', dto.sort === 'price_asc' ? 'ASC' : 'DESC', 'NULLS LAST').addOrderBy('property.id', 'DESC');
        } else query.orderBy('property.id', 'DESC');
        const [data, total] = await query
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
            where: { id, status: PropertyStatus.ACTIVE },
            relations: { files: true, iconDescriptions: true },
        });
        if (!property) throw new NotFoundException({ code: "API_PROPIEDAD_NO_DISPONIBLE", message: 'Propiedad no disponible', params: {  } });
        return {
            id: property.id, title: property.title, description: property.description,
            address: property.address, cost: property.cost, typeOfCoin: property.typeOfCoin,
            rooms: property.rooms, guest: property.guest,
            latitude: property.latitude, longitude: property.longitude,
            typeOfProperty: property.typeOfProperty,
            services: property.services, iconDescriptions: property.iconDescriptions,
            files: property.files.map(({ path, mimeType, url }) => ({ path, mimeType, url })),
            owner: { id: property.owner.id, name: property.owner.name },
            reservedTenantId: property.reservedTenantId,
            reservedTenantName: property.reservedTenantName,
            reservedAt: property.reservedAt,
        };
    }

    /**
     * Datos públicos de un propietario para su página de propiedades: solo nombre y cuántas propiedades publicadas tiene.
     * Una persona sin propiedades publicadas no existe para el público (así no se puede consultar el nombre de cualquier usuario por su id).
     */
    async findPublicOwner(ownerId: number) {
        const [[first], activeProperties] = await this.propertyRepo.findAndCount({
            where: { ownerId, status: PropertyStatus.ACTIVE },
            take: 1,
        });
        if (!first) throw new NotFoundException({ code: "API_PROPIETARIO_NO_DISPONIBLE", message: 'Propietario no disponible', params: {} });
        return { id: first.owner.id, name: first.owner.name, activeProperties };
    }

    async findByTenant(tenantId: number) {
        const properties = await this.propertyRepo.find({
            where: { reservedTenantId: tenantId },
            relations: { files: true },
            order: { reservedAt: 'DESC', id: 'DESC' },
        });
        return properties.map((property) => ({
            id: property.id, title: property.title, description: property.description,
            address: property.address, cost: property.cost, typeOfCoin: property.typeOfCoin,
            rooms: property.rooms, guest: property.guest, status: property.status,
            typeOfProperty: property.typeOfProperty, services: property.services,
            files: property.files.map(({ path, mimeType, url }) => ({ path, mimeType, url })),
            owner: { id: property.owner.id, name: property.owner.name },
            reservedAt: property.reservedAt,
        }));
    }

    async findOne(id: number) {
        const property = await this.propertyRepo.findOne({
            where: { id },
            relations: { files: true, iconDescriptions: true },
        });

        if (!property) {
            throw new NotFoundException({ code: "API_PROPERTY_WITH_ID_NOT_FOUND", message: `Property with Id ${id} not found`, params: { v0: id } });
        }

        return property;
    }

    async findByOwner(ownerId: number) {
        const owner = await this.userRepo.findOneBy({ id: ownerId });
        if (!owner) {
            throw new NotFoundException({ code: "API_USER_WITH_ID_NOT_FOUND", message: `User with Id ${ownerId} not found`, params: { v0: ownerId } });
        }

        return await this.propertyRepo.find({
            where: { owner: { id: ownerId } },
            relations: { files: true, iconDescriptions: true },
        });
    }

    async update(id: number, updatePropertyDto: UpdatePropertyDto) {
        const property = await this.findOne(id);

        const { typeOfPropertyId, serviceIds, ...rest } = updatePropertyDto;

        if (typeOfPropertyId) {
            const typeOfProperty = await this.typeOfPropertyRepo.findOneBy({ id: typeOfPropertyId });
            if (!typeOfProperty) {
                throw new NotFoundException({ code: "API_TYPEOFPROPERTY_WITH_ID_NOT_FOUND", message: `TypeOfProperty with Id ${typeOfPropertyId} not found`, params: { v0: typeOfPropertyId } });
            }
            property.typeOfProperty = typeOfProperty;
        }

        if (serviceIds) {
            property.services = await this.serviceService.findByIds(serviceIds);
        }

        Object.assign(property, rest);

        return await this.propertyRepo.save(property);
    }

    /**
     * Acción del propietario: envía la propiedad a revisión (no la activa). Queda en estado
     * PENDING hasta que un administrador la apruebe con `review()`.
     */
    async publish(id: number) {
        const property = await this.findOne(id);

        if (property.status === PropertyStatus.ACTIVE) {
            throw new BadRequestException({ code: "API_LA_PROPIEDAD_YA_ESTA_ACTIVA", message: 'La propiedad ya está activa.', params: {  } });
        }
        if (property.status === PropertyStatus.PENDING) {
            throw new BadRequestException({ code: "API_LA_PROPIEDAD_YA_ESTA_EN_REVISION", message: 'La propiedad ya está en revisión.', params: {  } });
        }

        this.validateReadyForReview(property);

        property.status = PropertyStatus.PENDING;
        property.reviewNote = undefined;
        property.reviewedAt = undefined;

        return await this.propertyRepo.save(property);
    }

    /**
     * Acción del administrador: aprueba, pide cambios o rechaza una propiedad enviada a revisión.
     */
    async review(id: number, dto: ReviewPropertyDto) {
        const property = await this.findOne(id);

        if (property.status === PropertyStatus.DRAFT) {
            throw new BadRequestException({ code: "API_LA_PROPIEDAD_TODAVIA_NO_FUE_ENVIADA_A_REVISION", message: 'La propiedad todavía no fue enviada a revisión.', params: {  } });
        }

        if (dto.status === PropertyStatus.ACTIVE) {
            this.validateReadyForReview(property);
            await this.userService.ensureRole(property.owner.id, AppRole.OWNER);
        }

        property.status = dto.status;
        property.reviewNote = dto.status === PropertyStatus.ACTIVE ? undefined : dto.note;
        property.reviewedAt = new Date();

        return await this.propertyRepo.save(property);
    }

    private validateLocation(property: Property) {
        if (!property.address?.trim() || property.address.length > 300 ||
            !Number.isFinite(property.latitude) || !Number.isFinite(property.longitude) ||
            Math.abs(property.latitude!) > 90 || Math.abs(property.longitude!) > 180) {
            throw new BadRequestException({ code: "API_COMPLETA_LA_DIRECCION_Y_CONFIRMA_LA_UBICACION_EN_EL", message: 'Completa la dirección y confirma la ubicación en el mapa antes de publicar.', params: {  } });
        }
    }

    /** Requisitos mínimos para que una propiedad pase a revisión o quede activa. */
    private validateReadyForReview(property: Property) {
        if (!property.title?.trim() || !property.description?.trim()) {
            throw new BadRequestException({ code: "API_COMPLETA_EL_TITULO_Y_LA_DESCRIPCION_ANTES_DE_ENVIAR", message: 'Completa el título y la descripción antes de enviar a revisión.', params: {  } });
        }

        this.validateLocation(property);

        if ((property.files?.length ?? 0) < 3) {
            throw new BadRequestException({ code: "API_AGREGA_AL_MENOS_3_IMAGENES_ANTES_DE_ENVIAR_A", message: 'Agrega al menos 3 imágenes antes de enviar a revisión.', params: {  } });
        }

        if (!property.services?.length) {
            throw new BadRequestException({ code: "API_SELECCIONA_AL_MENOS_UN_SERVICIO_ANTES_DE_ENVIAR_A", message: 'Selecciona al menos un servicio antes de enviar a revisión.', params: {  } });
        }
    }

    async remove(id: number) {
        const property = await this.findOne(id);
        property.status = PropertyStatus.INACTIVE;
        return await this.propertyRepo.save(property);
    }

    async findActive(query: FindPropertiesDto = {}, pricing?: PropertyPriceContext) {
        return this.findAll(query, pricing);
    }

    /** Listado para el panel de administración: todas las propiedades, con propietario, filtrables por estado. */
    async findAllForAdmin(dto: FindPropertiesAdminDto = {}) {
        const { status, search, page = 1, limit = 20 } = dto;

        const query = this.propertyRepo.createQueryBuilder('property')
            .leftJoinAndSelect('property.owner', 'owner')
            .leftJoinAndSelect('property.typeOfProperty', 'typeOfProperty');

        if (status) {
            query.andWhere('property.status = :status', { status });
        }

        if (search) {
            query.andWhere(
                '(LOWER(property.title) LIKE :search OR LOWER(property.address) LIKE :search OR LOWER(owner.name) LIKE :search)',
                { search: `%${search.toLowerCase()}%` },
            );
        }

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

    // --- File methods ---

    async saveFiles(propertyId: number, files: Express.Multer.File[]) {
        const property = await this.findOne(propertyId);

        if (!files?.length) throw new BadRequestException('No se enviaron archivos.');
        const propertyFolder = `Propiedades/${resourceFolder(property.title, property.id, 'propiedad')}`;
        const uploaded: string[] = [];
        try {
            const rows: PropertyFile[] = [];
            for (const file of files) {
                const stored = await this.dropbox.upload(file, `${propertyFolder}/Fotos`);
                uploaded.push(stored.path);
                rows.push(this.propertyFileRepo.create({ ...stored, storage: 'dropbox', fileName: file.originalname, mimeType: file.mimetype, size: file.size, uploadedBy: property.owner?.name ?? 'unknown', property }));
            }
            return await this.propertyFileRepo.save(rows);
        } catch (error) {
            await Promise.allSettled(uploaded.map(path => this.dropbox.delete(path)));
            throw error;
        }
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
            throw new NotFoundException({ code: "API_FILE_WITH_ID_NOT_FOUND_FOR_PROPERTY", message: `File with Id ${fileId} not found for property ${propertyId}`, params: { v0: fileId, v1: propertyId } });
        }

        if (file.storage === 'dropbox') await this.dropbox.delete(file.path);
        else if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
        }

        return await this.propertyFileRepo.remove(file);
    }
}
