import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import { Property } from '../property/entities/property.entity';
import { PropertyStatus } from '../property/property-status.enum';
import { PropertyComment } from './entities/property-comment.entity';
import { CreateCommentDto } from './dto/create-comment.dto';

@Injectable()
export class CommentService {
  constructor(private readonly dataSource: DataSource) {}

  async findByProperty(propertyId: number) {
    const property = await this.dataSource.getRepository(Property).findOneBy({ id: propertyId, status: PropertyStatus.ACTIVE });
    if (!property) throw new NotFoundException('Propiedad no disponible');
    const comments = await this.dataSource.getRepository(PropertyComment).find({
      where: { property: { id: propertyId } },
      relations: { author: true },
      select: { id: true, content: true, createdAt: true, author: { id: true, name: true } },
      order: { createdAt: 'DESC', id: 'DESC' },
    });
    return comments.map((comment) => ({
      id: comment.id,
      content: comment.content,
      createdAt: comment.createdAt,
      author: { id: comment.author.id, name: comment.author.name },
    }));
  }

  async create(propertyId: number, userId: number, dto: CreateCommentDto) {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const property = await manager.getRepository(Property).createQueryBuilder('property')
          .where('property.id = :id', { id: propertyId })
          .setLock('pessimistic_write').getOne();
        if (!property) throw new NotFoundException('Propiedad no encontrada');
        if (property.reservedTenantId !== userId || property.ownerId === userId) {
          throw new ForbiddenException('Solo el inquilino vinculado a esta propiedad puede comentar');
        }
        const comments = manager.getRepository(PropertyComment);
        const existing = await comments.findOneBy({ property: { id: propertyId }, author: { id: userId } });
        if (existing) throw new ConflictException('Ya comentaste esta propiedad');
        const comment = comments.create({ content: dto.content, property: { id: propertyId }, author: { id: userId } });
        const saved = await comments.save(comment);
        return { id: saved.id, content: saved.content, createdAt: saved.createdAt };
      });
    } catch (error) {
      if (error instanceof QueryFailedError && (error.driverError as { code?: string }).code === '23505') {
        throw new ConflictException('Ya comentaste esta propiedad');
      }
      throw error;
    }
  }
}
