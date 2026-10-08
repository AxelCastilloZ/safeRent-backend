import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { PropertyStatus } from '../../property/property-status.enum';
import { Conversation } from './entities/conversation.entity';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { User } from '../../user/entities/user.entity';
import { Property } from '../../property/entities/property.entity';

@Injectable()
export class ConversationService {
  constructor(
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    @InjectRepository(Property)
    private readonly propertyRepo: Repository<Property>,
  ) {}

  async createForUser(propertyId: number, userId: number) {
    const property = await this.propertyRepo.findOneBy({ id: propertyId, status: PropertyStatus.ACTIVE });
    if (!property || !property.owner?.isActive) throw new NotFoundException('Propiedad no disponible');
    if (property.owner.id === userId) throw new BadRequestException('No puedes iniciar un chat contigo mismo');
    return this.create({ propertyId, participantIds: [userId, property.owner.id] });
  }

  async create(createConversationDto: CreateConversationDto) {
    const { participantIds, propertyId } = createConversationDto;

    const property = await this.propertyRepo.findOneBy({ id: propertyId });
    if (!property) {
      throw new NotFoundException(`Property with Id ${propertyId} not found`);
    }

    const participants = await this.userRepo.findBy({ id: In(participantIds) });
    if (participants.length !== participantIds.length) {
      throw new NotFoundException('One or more participants were not found');
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

  async findByParticipant(userId: number) {
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user) {
      throw new NotFoundException(`User with Id ${userId} not found`);
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
      .leftJoinAndSelect('conversation.property', 'property')
      .leftJoinAndSelect('property.owner', 'owner')
      .leftJoinAndSelect('property.typeOfProperty', 'typeOfProperty')
      .leftJoinAndSelect('property.services', 'services')
      .orderBy('conversation.createdAt', 'DESC')
      .getMany();
  }

  async findOne(id: number) {
    const conversation = await this.conversationRepo.findOne({
      where: { id },
      relations: { participants: true, property: true },
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation with Id ${id} not found`);
    }

    return conversation;
  }

  private async findExisting(propertyId: number, participantIds: number[]) {
    const conversations = await this.conversationRepo.find({
      where: { property: { id: propertyId } },
      // Misma forma que `findOne`: quien llama (conversationView) necesita la propiedad y su dueño.
      relations: { participants: true, property: true },
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
