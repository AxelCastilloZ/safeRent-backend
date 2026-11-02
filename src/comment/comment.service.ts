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
    if (!property) throw new NotFoundException({ code: "API_PROPIEDAD_NO_DISPONIBLE", message: 'Propiedad no disponible', params: {  } });
    const comments = await this.dataSource.getRepository(PropertyComment).find({
      where: { property: { id: propertyId }, hidden: false },
      relations: { author: true },
      select: { id: true, content: true, rating: true, createdAt: true, author: { id: true, name: true } },
      order: { createdAt: 'DESC', id: 'DESC' },
    });
    return comments.map((comment) => ({
      id: comment.id,
      content: comment.content,
      rating: comment.rating,
      createdAt: comment.createdAt,
      author: { id: comment.author.id, name: comment.author.name },
    }));
  }

  /**
   * Calificación (promedio con un decimal y cantidad) de cada propiedad de un propietario, para sus tarjetas.
   * Cuenta solo comentarios visibles y con puntaje; las propiedades sin calificaciones no aparecen.
   */
  async ratingsForOwner(ownerId: number): Promise<{ propertyId: number; average: number; count: number }[]> {
    return this.dataSource.query(
      `SELECT c."propertyId" AS "propertyId", ROUND(AVG(c.rating)::numeric, 1)::float AS average, count(*)::int AS count
       FROM property_comment c
       JOIN property p ON p.id = c."propertyId"
       WHERE p."ownerId" = $1 AND c.hidden = false AND c.rating IS NOT NULL
       GROUP BY c."propertyId"`,
      [ownerId],
    );
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
      id: comment.id, content: comment.content, rating: comment.rating, createdAt: comment.createdAt,
      hidden: comment.hidden, moderationNote: comment.moderationNote,
      moderatedAt: comment.moderatedAt, moderatedById: comment.moderatedById,
      author: { id: comment.author.id, name: comment.author.name },
      property: { id: comment.property.id, title: comment.property.title },
    }));
  }

  async moderate(id: number, adminId: number, dto: ModerateCommentDto) {
    if (dto.hidden && !dto.note?.trim()) throw new BadRequestException({ code: "API_ESCRIBE_EL_MOTIVO_PARA_OCULTAR_EL_COMENTARIO", message: 'Escribe el motivo para ocultar el comentario', params: {  } });
    const result = await this.dataSource.getRepository(PropertyComment).update(id, {
      hidden: dto.hidden,
      moderationNote: dto.hidden ? dto.note!.trim() : null,
      moderatedAt: new Date(),
      moderatedById: adminId,
    });
    if (!result.affected) throw new NotFoundException({ code: "API_COMENTARIO_NO_ENCONTRADO", message: 'Comentario no encontrado', params: {  } });
    return { id, hidden: dto.hidden };
  }

  async create(propertyId: number, userId: number, dto: CreateCommentDto) {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const property = await manager.getRepository(Property).createQueryBuilder('property')
          .where('property.id = :id', { id: propertyId })
          .setLock('pessimistic_write').getOne();
        if (!property) throw new NotFoundException({ code: "API_PROPIEDAD_NO_ENCONTRADA", message: 'Propiedad no encontrada', params: {  } });
        if (property.reservedTenantId !== userId || property.ownerId === userId) {
          throw new ForbiddenException({ code: "API_SOLO_EL_INQUILINO_VINCULADO_A_ESTA_PROPIEDAD_PUEDE_COMENTAR", message: 'Solo el inquilino vinculado a esta propiedad puede comentar', params: {  } });
        }
        const comments = manager.getRepository(PropertyComment);
        const existing = await comments.findOneBy({ property: { id: propertyId }, author: { id: userId } });
        if (existing) throw new ConflictException({ code: "API_YA_COMENTASTE_ESTA_PROPIEDAD", message: 'Ya comentaste esta propiedad', params: {  } });
        const comment = comments.create({ content: dto.content, ...(dto.rating !== undefined ? { rating: dto.rating } : {}), property: { id: propertyId }, author: { id: userId } });
        const saved = await comments.save(comment);
        return { id: saved.id, content: saved.content, rating: saved.rating, createdAt: saved.createdAt };
      });
    } catch (error) {
      if (error instanceof QueryFailedError && (error.driverError as { code?: string }).code === '23505') {
        throw new ConflictException({ code: "API_YA_COMENTASTE_ESTA_PROPIEDAD", message: 'Ya comentaste esta propiedad', params: {  } });
      }
      throw error;
    }
  }
}
