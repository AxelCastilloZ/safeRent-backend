import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Message } from './entities/message.entity';
import { CreateMessageDto } from './dto/create-message.dto';
import { User } from '../../user/entities/user.entity';
import { Conversation } from '../conversation/entities/conversation.entity';
import { ConversationService } from '../conversation/conversation.service';

@Injectable()
export class MessageService {
  constructor(
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    private readonly conversationService: ConversationService,
  ) {}

  async create(conversationId: number, createMessageDto: CreateMessageDto) {
    const { message, senderId } = createMessageDto;

    const conversation = await this.conversationService.findOne(conversationId);
    this.ensureParticipant(conversation, senderId);

    const sender = await this.userRepo.findOneBy({ id: senderId });
    if (!sender) {
      throw new NotFoundException(`User with Id ${senderId} not found`);
    }

    const newMessage = this.messageRepo.create({
      message,
      conversation,
      sender,
    });

    return await this.messageRepo.save(newMessage);
  }

  async findOne(id: number) {
    const message = await this.messageRepo.findOne({
      where: { id },
      relations: { sender: true, conversation: true },
    });

    if (!message) {
      throw new NotFoundException(`Message with Id ${id} not found`);
    }

    return message;
  }

  async findByConversation(conversationId: number) {
    await this.conversationService.findOne(conversationId);

    return await this.messageRepo.find({
      where: { conversation: { id: conversationId } },
      relations: { sender: true },
      order: { createdAt: 'ASC' },
    });
  }

  private ensureParticipant(conversation: Conversation, userId: number) {
    const isParticipant = conversation.participants.some((participant) => participant.id === userId);
    if (!isParticipant) {
      throw new ForbiddenException('The user is not a participant in this conversation');
    }
  }
}
