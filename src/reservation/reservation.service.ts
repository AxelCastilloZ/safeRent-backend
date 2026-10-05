import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Conversation } from '../messages/conversation/entities/conversation.entity';
import { Property } from '../property/entities/property.entity';
import { PropertyStatus } from '../property/property-status.enum';
import { User } from '../user/entities/user.entity';

@Injectable()
export class ReservationService {
  constructor(private readonly dataSource: DataSource) {}

  async reserve(conversationId: number, ownerId: number) {
    return this.dataSource.transaction(async (manager) => {
      const conversation = await manager.getRepository(Conversation).findOne({
        where: { id: conversationId },
        relations: { participants: true, property: true },
      });
      if (!conversation?.property) throw new NotFoundException('Conversación no encontrada');
      const properties = manager.getRepository(Property);
      // Lock only the property row, not nullable joins, to serialize competing reservations.
      const property = await properties.createQueryBuilder('property')
        .where('property.id = :id', { id: conversation.property.id })
        .setLock('pessimistic_write').getOne();
      if (!property) throw new NotFoundException('Propiedad no encontrada');
      if (property.ownerId !== ownerId ||
          !conversation.participants.some((user) => user.id === ownerId)) {
        throw new ForbiddenException('Solo el propietario puede alquilar esta propiedad');
      }
      const tenants = conversation.participants.filter((user) => user.id !== ownerId);
      if (tenants.length !== 1) throw new BadRequestException('La conversación debe tener un único inquilino');
      const tenant = await manager.getRepository(User).findOneBy({ id: tenants[0].id, isActive: true });
      if (!tenant) throw new BadRequestException('El inquilino no está activo');
      if (property.status !== PropertyStatus.ACTIVE) throw new BadRequestException('Solo puedes reservar una propiedad activa');
      if (property.reservedTenantId && property.reservedTenantId !== tenant.id) {
        throw new ConflictException('La propiedad ya está reservada por otra persona');
      }
      if (!property.reservedTenantId) {
        property.reservedTenantId = tenant.id;
        property.reservedTenantName = [tenant.name, tenant.surname1, tenant.surname2].filter(Boolean).join(' ');
        property.reservedAt = new Date();
        await properties.save(property);
      }
      return {
        propertyId: property.id,
        reservedTenantId: property.reservedTenantId,
        reservedTenantName: property.reservedTenantName,
        reservedAt: property.reservedAt,
      };
    });
  }
}
