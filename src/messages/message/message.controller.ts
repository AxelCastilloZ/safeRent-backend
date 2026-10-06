import { Controller, Get, Post, Body, Param, Req, ParseIntPipe } from '@nestjs/common';
import { AppRole, Roles } from '../../auth/access';
import type { AuthRequest } from '../../auth/access';
import { AccessTo } from '../../auth/guard/resource-access.guard';
import { messageView } from '../message-views';
import { MessageService } from './message.service';
import { CreateMessageDto } from './dto/create-message.dto';

@Roles(AppRole.CLIENT, AppRole.OWNER)
@Controller('conversations/:conversationId/messages')
export class MessageController {
  constructor(private readonly messageService: MessageService) {}

  @AccessTo('conversation')
  @Post()
  async create(
    @Param('conversationId', ParseIntPipe) conversationId: number,
    @Body() createMessageDto: CreateMessageDto,
    @Req() req: AuthRequest,
  ) {
    return messageView(await this.messageService.create(conversationId, { ...createMessageDto, senderId: req.user.id }));
  }

  @AccessTo('conversation')
  @Get()
  async findAll(@Param('conversationId') conversationId: number) {
    return (await this.messageService.findByConversation(conversationId)).map(messageView);
  }
}
