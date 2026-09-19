import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversationService } from './conversation.service';
import { ConversationController } from './conversation.controller';
import { Conversation } from './entities/conversation.entity';
import { User } from '../../user/entities/user.entity';
import { Property } from '../../property/entities/property.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Conversation, User, Property])],
  controllers: [ConversationController],
  providers: [ConversationService],
  exports: [ConversationService],
})
export class ConversationModule {}
