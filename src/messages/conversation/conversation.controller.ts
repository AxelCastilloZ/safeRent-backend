import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { ConversationService } from './conversation.service';
import { CreateConversationDto } from './dto/create-conversation.dto';

@Controller('conversations')
export class ConversationController {
  constructor(private readonly conversationService: ConversationService) {}

  @Post()
  create(@Body() createConversationDto: CreateConversationDto) {
    return this.conversationService.create(createConversationDto);
  }

  @Get('user/:userId')
  findByParticipant(@Param('userId') userId: number) {
    return this.conversationService.findByParticipant(userId);
  }

  @Get(':id')
  findOne(@Param('id') id: number) {
    return this.conversationService.findOne(id);
  }
}
