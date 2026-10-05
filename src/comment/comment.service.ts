import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import { Property } from '../property/entities/property.entity';
import { PropertyStatus } from '../property/property-status.enum';
import { PropertyComment } from './entities/property-comment.entity';
import { ModerateCommentDto } from './dto/moderate-comment.dto';
import { CreateCommentDto } from './dto/create-comment.dto';

@Injectable()
export class CommentService {
  constructor(private readonly dataSource: DataSource) {}

  async findByProperty(propertyId: number) {
    const property = await this.dataSource.getRepository(Property).findOneBy({ id: propertyId, status: PropertyStatus.ACTIVE });
    if (!property) throw new NotFoundException('Propiedad no disponible');
    const comments = await this.dataSource.getRepository(PropertyComment).find({
      where: { property: { id: propertyId }, hidden: false },
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

  async findOwn(propertyId: number, userId: number) {
    const comment = await this.dataSource.getRepository(PropertyComment).findOne({
      where: { property: { id: propertyId }, author: { id: userId } },
      select: { id: true, hidden: true },
    });
    return comment ? { id: comment.id, hidden: comment.hidden } : null;
  }

  async findForAdmin() {
    const comments = await this.dataSource.getRepository(PropertyComment).find({
      relations: { author: true, property: true },
      order: { createdAt: 'DESC', id: 'DESC' },
    });
    return comments.map((comment) => ({
      id: comment.id, content: comment.content, createdAt: comment.createdAt,
      hidden: comment.hidden, moderationNote: comment.moderationNote,
      moderatedAt: comment.moderatedAt, moderatedById: comment.moderatedById,
      author: { id: comment.author.id, name: comment.author.name },
      property: { id: comment.property.id, title: comment.property.title },
    }));
  }

  async moderate(id: number, adminId: number, dto: ModerateCommentDto) {
    if (dto.hidden && !dto.note?.trim()) throw new BadRequestException('Escribe el motivo para ocultar el comentario');
    const result = await this.dataSource.getRepository(PropertyComment).update(id, {
      hidden: dto.hidden,
      moderationNote: dto.hidden ? dto.note!.trim() : null,
      moderatedAt: new Date(),
      moderatedById: adminId,
    });
    if (!result.affected) throw new NotFoundException('Comentario no encontrado');
    return { id, hidden: dto.hidden };
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
