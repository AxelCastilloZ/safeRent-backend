import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PropertiesModule } from './properties/properties.module';

@Module({
  imports: [PropertiesModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
