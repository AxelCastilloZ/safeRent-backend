import { Controller, Get, Post, Patch, Body, Param, Req, ParseIntPipe } from '@nestjs/common';
import { AppRole, Roles } from '../../auth/access';
import type { AuthRequest } from '../../auth/access';
import { AccessTo } from '../../auth/guard/resource-access.guard';
import { conversationView } from '../message-views';
import { ConversationService } from './conversation.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { CreateDirectConversationDto } from './dto/create-direct-conversation.dto';

@Roles(AppRole.CLIENT, AppRole.OWNER, AppRole.ADMIN)
@Controller('conversations')
export class ConversationController {
  constructor(private readonly conversationService: ConversationService) {}

  @Roles(AppRole.CLIENT)
  @Post()
  async create(@Body() dto: CreateConversationDto, @Req() req: AuthRequest) {
    return conversationView(await this.conversationService.createForUser(dto.propertyId, req.user.id));
  }

  // Chat de una cita confirmada: lo puede abrir el inquilino o el propietario.
  @Roles(AppRole.CLIENT, AppRole.OWNER)
  @Post('visit/:visitId')
  async createFromVisit(@Param('visitId', ParseIntPipe) visitId: number, @Req() req: AuthRequest) {
    return conversationView(await this.conversationService.createFromVisit(visitId, req.user.id));
  }

  // Solo el administrador inicia conversaciones directas; los usuarios responden desde su bandeja.
  @Roles(AppRole.ADMIN)
  @Post('direct')
  async createDirect(@Body() dto: CreateDirectConversationDto, @Req() req: AuthRequest) {
    return conversationView(await this.conversationService.createDirect(req.user.id, dto.userId));
  }

  @AccessTo('inbox')
  @Get('user/:userId')
  async findByParticipant(@Param('userId', ParseIntPipe) userId: number) {
    const conversations = await this.conversationService.findByParticipant(userId);
    const unread = await this.conversationService.countUnread(userId, conversations.map((conversation) => conversation.id));
    return conversations.map((conversation) => conversationView(conversation, unread.get(conversation.id) ?? 0));
  }

  // El usuario sale del token: nadie puede marcar como leídos los mensajes de otra persona.
  @AccessTo('conversation')
  @Patch(':id/read')
  markRead(@Param('id', ParseIntPipe) id: number, @Req() req: AuthRequest) {
    return this.conversationService.markRead(id, req.user.id);
  }

  @AccessTo('conversation')
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return conversationView(await this.conversationService.findOne(id));
  }
}
