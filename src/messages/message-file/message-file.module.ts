import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MessageFileService } from './message-file.service';
import { MessageFileController } from './message-file.controller';
import { MessageFile } from './entities/message-file.entity';
import { MessageModule } from '../message/message.module';

@Module({
  imports: [TypeOrmModule.forFeature([MessageFile]), MessageModule],
  controllers: [MessageFileController],
  providers: [MessageFileService],
  exports: [MessageFileService],
})
export class MessageFileModule {}
