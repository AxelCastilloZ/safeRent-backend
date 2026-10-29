import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AppRole } from '../../auth/access';
import { PropertyStatus } from '../../property/property-status.enum';
import { Conversation } from './entities/conversation.entity';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { User } from '../../user/entities/user.entity';
import { Property } from '../../property/entities/property.entity';
import { Message } from '../message/entities/message.entity';

@Injectable()
export class ConversationService {
  constructor(
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    @InjectRepository(Property)
    private readonly propertyRepo: Repository<Property>,

    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
  ) {}

  async createForUser(propertyId: number, userId: number) {
    const property = await this.propertyRepo.findOneBy({ id: propertyId, status: PropertyStatus.ACTIVE });
    if (!property || !property.owner?.isActive) throw new NotFoundException({ code: "API_PROPIEDAD_NO_DISPONIBLE", message: 'Propiedad no disponible', params: {  } });
    if (property.owner.id === userId) throw new BadRequestException({ code: "API_NO_PUEDES_INICIAR_UN_CHAT_CONTIGO_MISMO", message: 'No puedes iniciar un chat contigo mismo', params: {  } });
    return this.create({ propertyId, participantIds: [userId, property.owner.id] });
  }

  /**
   * Abre (o retoma) el chat de una cita confirmada. Lo puede hacer cualquiera de las dos personas: así el propietario
   * también puede escribir primero, algo que el chat normal no permite (solo el inquilino lo inicia).
   */
  async createFromVisit(visitId: number, userId: number) {
    const [visit] = await this.conversationRepo.manager.query<{ propertyId: number; tenantId: number; ownerId: number; status: string }[]>(
      'SELECT "propertyId", "tenantId", "ownerId", status FROM visit WHERE id = $1', [visitId],
    );
    if (!visit) throw new NotFoundException({ code: 'API_CITA_NO_ENCONTRADA', message: 'Cita no encontrada', params: {} });
    if (visit.tenantId !== userId && visit.ownerId !== userId) {
      throw new ForbiddenException({ code: 'API_NO_PARTICIPAS_EN_ESTA_CITA', message: 'No participas en esta cita', params: {} });
    }
    if (visit.status !== 'CONFIRMED') {
      throw new ConflictException({ code: 'API_EL_ESTADO_DE_LA_CITA_NO_PERMITE_ESTA_ACCION', message: 'El estado de la cita no permite esta acción', params: {} });
    }
    return this.create({ propertyId: visit.propertyId, participantIds: [visit.tenantId, visit.ownerId] });
  }

  async create(createConversationDto: CreateConversationDto) {
    const { participantIds, propertyId } = createConversationDto;

    const property = await this.propertyRepo.findOneBy({ id: propertyId });
    if (!property) {
      throw new NotFoundException({ code: "API_PROPERTY_WITH_ID_NOT_FOUND", message: `Property with Id ${propertyId} not found`, params: { v0: propertyId } });
    }

    const participants = await this.userRepo.findBy({ id: In(participantIds) });
    if (participants.length !== participantIds.length) {
      throw new NotFoundException({ code: "API_ONE_OR_MORE_PARTICIPANTS_WERE_NOT_FOUND", message: 'One or more participants were not found', params: {  } });
    }

    const existingConversation = await this.findExisting(propertyId, participantIds);
    if (existingConversation) {
      return existingConversation;
    }

    const newConversation = this.conversationRepo.create({
      property,
      participants,
    });

    return await this.conversationRepo.save(newConversation);
  }

  /**
   * Un administrador inicia (o retoma) una conversación directa con un usuario, sin propiedad de por medio.
   * Solo a cuentas activas que no sean administradoras. Es idempotente: si ya existe, devuelve esa.
   */
  async createDirect(adminId: number, userId: number) {
    if (userId === adminId) throw new BadRequestException({ code: "API_NO_PUEDES_INICIAR_UN_CHAT_CONTIGO_MISMO", message: 'No puedes iniciar un chat contigo mismo', params: {  } });

    const user = await this.userRepo.findOne({ where: { id: userId }, relations: { Roles: true } });
    if (!user) throw new NotFoundException({ code: "API_USER_WITH_ID_NOT_FOUND", message: `User with Id ${userId} not found`, params: { v0: userId } });
    if (!user.isActive) throw new BadRequestException({ code: "API_LA_CUENTA_DEL_USUARIO_ESTA_SUSPENDIDA", message: 'La cuenta del usuario está suspendida', params: {  } });
    if (user.Roles.some((role) => role.name === AppRole.ADMIN)) {
      throw new BadRequestException({ code: "API_NO_PUEDES_INICIAR_UN_CHAT_CON_OTRO_ADMINISTRADOR", message: 'No puedes iniciar un chat con otro administrador', params: {  } });
    }

    const existing = await this.findExistingDirect(adminId, userId);
    if (existing) return this.findOne(existing.id);

    const admin = await this.userRepo.findOneBy({ id: adminId });
    if (!admin) throw new NotFoundException({ code: "API_USER_WITH_ID_NOT_FOUND", message: `User with Id ${adminId} not found`, params: { v0: adminId } });

    const saved = await this.conversationRepo.save(this.conversationRepo.create({ property: null, participants: [admin, user] }));
    // Se vuelve a leer para devolver la misma forma que el resto (participantes con roles).
    return this.findOne(saved.id);
  }

  async findByParticipant(userId: number) {
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user) {
      throw new NotFoundException({ code: "API_USER_WITH_ID_NOT_FOUND", message: `User with Id ${userId} not found`, params: { v0: userId } });
    }

    // No usar find({ where: { participants: { id } }, relations: { participants: true } }):
    // TypeORM aplica ese where también sobre la relación cargada, así que
    // `participants` queda recortado a solo ese usuario (el mismo problema que
    // ya resuelve PropertyService con serviceIds). Se separa el join que
    // filtra del que trae todos los participantes.
    return await this.conversationRepo
      .createQueryBuilder('conversation')
      .innerJoin('conversation.participants', 'me', 'me.id = :userId', { userId })
      .leftJoinAndSelect('conversation.participants', 'participants')
      .leftJoinAndSelect('participants.Roles', 'participantRoles')
      .leftJoinAndSelect('conversation.property', 'property')
      .leftJoinAndSelect('property.owner', 'owner')
      .leftJoinAndSelect('property.typeOfProperty', 'typeOfProperty')
      .leftJoinAndSelect('property.services', 'services')
      .orderBy('conversation.createdAt', 'DESC')
      .getMany();
  }

  /**
   * Mensajes sin leer de `userId` por conversación: los que envió la otra persona y aún no tienen
   * `readAt`. Una sola consulta agrupada para toda la bandeja; las conversaciones sin pendientes no aparecen.
   */
  async countUnread(userId: number, conversationIds: number[]): Promise<Map<number, number>> {
    if (conversationIds.length === 0) return new Map();

    const rows = await this.messageRepo
      .createQueryBuilder('message')
      .select('"message"."conversationId"', 'conversationId')
      .addSelect('COUNT(*)', 'count')
      .where('"message"."conversationId" IN (:...conversationIds)', { conversationIds })
      .andWhere('"message"."senderId" != :userId', { userId })
      .andWhere('"message"."readAt" IS NULL')
      .groupBy('"message"."conversationId"')
      .getRawMany<{ conversationId: number; count: string }>();

    return new Map(rows.map((row) => [Number(row.conversationId), Number(row.count)]));
  }

  /**
   * `userId` abrió la conversación: marca como leídos los mensajes que le envió la otra persona.
   * Los propios nunca cambian. Devuelve cuántos mensajes se marcaron.
   */
  async markRead(conversationId: number, userId: number) {
    const result = await this.messageRepo
      .createQueryBuilder()
      .update(Message)
      .set({ readAt: new Date() })
      .where('"conversationId" = :conversationId', { conversationId })
      .andWhere('"senderId" != :userId', { userId })
      .andWhere('"readAt" IS NULL')
      .execute();

    return { updated: result.affected ?? 0 };
  }

  async findOne(id: number) {
    const conversation = await this.conversationRepo.findOne({
      where: { id },
      relations: { participants: { Roles: true }, property: true },
    });

    if (!conversation) {
      throw new NotFoundException({ code: "API_CONVERSATION_WITH_ID_NOT_FOUND", message: `Conversation with Id ${id} not found`, params: { v0: id } });
    }

    return conversation;
  }

  /** Conversación directa (sin propiedad) entre el administrador y el usuario, si ya existe. */
  private findExistingDirect(adminId: number, userId: number) {
    return this.conversationRepo
      .createQueryBuilder('conversation')
      .innerJoin('conversation.participants', 'admin', 'admin.id = :adminId', { adminId })
      .innerJoin('conversation.participants', 'member', 'member.id = :userId', { userId })
      .where('"conversation"."propertyId" IS NULL')
      .getOne();
  }

  private async findExisting(propertyId: number, participantIds: number[]) {
    const conversations = await this.conversationRepo.find({
      where: { property: { id: propertyId } },
      // Misma forma que `findOne`: quien llama (conversationView) necesita la propiedad y su dueño.
      relations: { participants: { Roles: true }, property: true },
    });

    return conversations.find((conversation) => {
      const existingIds = conversation.participants.map((participant) => participant.id);
      return (
        existingIds.length === participantIds.length &&
        participantIds.every((id) => existingIds.includes(id))
      );
    });
  }
}
