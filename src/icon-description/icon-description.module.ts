import { Module } from '@nestjs/common';
import { IconDescriptionService } from './icon-description.service';
import { IconDescriptionController } from './icon-description.controller';

@Module({
  controllers: [IconDescriptionController],
  providers: [IconDescriptionService],
})
export class IconDescriptionModule {}
