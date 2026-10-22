import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DropboxService } from './dropbox.service';

@Module({
  imports: [ConfigModule],
  providers: [DropboxService],
  exports: [DropboxService],
})
export class DropboxModule {}
