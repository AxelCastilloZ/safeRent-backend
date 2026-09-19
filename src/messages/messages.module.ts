import { Module } from '@nestjs/common';
import { ConversationModule } from './conversation/conversation.module';
import { MessageModule } from './message/message.module';
import { MessageFileModule } from './message-file/message-file.module';

@Module({
  imports: [ConversationModule, MessageModule, MessageFileModule],
  exports: [ConversationModule, MessageModule, MessageFileModule],
})
export class MessagesModule {}
