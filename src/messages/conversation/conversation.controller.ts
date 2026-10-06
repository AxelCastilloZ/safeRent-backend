import { Controller, Get, Post, Body, Param, Req, ParseIntPipe } from '@nestjs/common';
import { AppRole, Roles } from '../../auth/access';
import type { AuthRequest } from '../../auth/access';
import { AccessTo } from '../../auth/guard/resource-access.guard';
import { conversationView } from '../message-views';
import { ConversationService } from './conversation.service';
import { CreateConversationDto } from './dto/create-conversation.dto';

@Roles(AppRole.CLIENT, AppRole.OWNER)
@Controller('conversations')
export class ConversationController {
  constructor(private readonly conversationService: ConversationService) {}

  @Roles(AppRole.CLIENT)
  @Post()
  async create(@Body() dto: CreateConversationDto, @Req() req: AuthRequest) {
    return conversationView(await this.conversationService.createForUser(dto.propertyId, req.user.id));
  }

  @AccessTo('inbox')
  @Get('user/:userId')
  async findByParticipant(@Param('userId', ParseIntPipe) userId: number) {
    return (await this.conversationService.findByParticipant(userId)).map(conversationView);
  }

  @AccessTo('conversation')
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return conversationView(await this.conversationService.findOne(id));
  }
}
