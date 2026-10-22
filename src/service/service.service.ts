import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, QueryFailedError, Repository } from 'typeorm';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { Service } from './entities/service.entity';

@Injectable()
export class ServiceService {
  constructor(
    @InjectRepository(Service)
    private readonly serviceRepo: Repository<Service>,
  ) {}

  async create(createServiceDto: CreateServiceDto): Promise<Service> {
    const service = this.serviceRepo.create(createServiceDto);
    return this.save(service);
  }

  findAll() {
    return this.serviceRepo.find({ order: { name: 'ASC' } });
  }

  async findOne(id: number): Promise<Service> {
    const service = await this.serviceRepo.findOneBy({ id });
    if (!service)
      throw new NotFoundException({ code: "API_SERVICE_WITH_ID_NOT_FOUND", message: `Service with Id ${id} not found`, params: { v0: id } });
    return service;
  }

  async update(
    id: number,
    updateServiceDto: UpdateServiceDto,
  ): Promise<Service> {
    const service = await this.findOne(id);
    this.serviceRepo.merge(service, updateServiceDto);
    return this.save(service);
  }

  async remove(id: number): Promise<void> {
    const service = await this.findOne(id);
    const inUse = await this.serviceRepo
      .createQueryBuilder('service')
      .innerJoin('service.properties', 'property')
      .where('service.id = :id', { id })
      .getExists();
    if (inUse)
      throw new ConflictException(
        { code: "API_THIS_SERVICE_IS_ASSIGNED_TO_A_PROPERTY_AND_CANNOT", message: 'This service is assigned to a property and cannot be deleted', params: {  } },
      );
    try {
      await this.serviceRepo.remove(service);
    } catch (error: unknown) {
      // The foreign key also protects assignments made after the check above.
      if (this.databaseCode(error) === '23503') {
        throw new ConflictException(
          { code: "API_THIS_SERVICE_IS_ASSIGNED_TO_A_PROPERTY_AND_CANNOT", message: 'This service is assigned to a property and cannot be deleted', params: {  } },
        );
      }
      throw error;
    }
  }

  async findByIds(ids: number[]): Promise<Service[]> {
    if (ids.length === 0) return [];
    const uniqueIds = [...new Set(ids)];
    const services = await this.serviceRepo.findBy({ id: In(uniqueIds) });
    const foundIds = new Set(services.map((service) => service.id));
    const missing = uniqueIds.filter((id) => !foundIds.has(id));
    if (missing.length) {
      throw new NotFoundException({ code: "API_SERVICES_NOT_FOUND", message: `Services not found: ${missing.join(', ')}`, params: { v0: missing.join(', ') } });
    }
    return services;
  }

  private async save(service: Service): Promise<Service> {
    try {
      return await this.serviceRepo.save(service);
    } catch (error: unknown) {
      if (this.databaseCode(error) === '23505') {
        throw new ConflictException({ code: "API_A_SERVICE_WITH_THIS_NAME_ALREADY_EXISTS", message: 'A service with this name already exists', params: {  } });
      }
      throw error;
    }
  }

  private databaseCode(error: unknown): unknown {
    if (error instanceof QueryFailedError) {
      return (error.driverError as { code?: string }).code;
    }
    return undefined;
  }
}
