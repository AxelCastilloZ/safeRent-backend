import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { MessageService } from './message.service';
import { CreateMessageDto } from './dto/create-message.dto';

@Controller('conversations/:conversationId/messages')
export class MessageController {
  constructor(private readonly messageService: MessageService) {}

  @Post()
  create(
    @Param('conversationId') conversationId: number,
    @Body() createMessageDto: CreateMessageDto,
  ) {
    return this.messageService.create(conversationId, createMessageDto);
  }

  @Get()
  findAll(@Param('conversationId') conversationId: number) {
    return this.messageService.findByConversation(conversationId);
  }
}
