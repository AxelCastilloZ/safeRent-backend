import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PropertyComment } from './entities/property-comment.entity';
import { Property } from '../property/entities/property.entity';
import { CommentController } from './comment.controller';
import { CommentService } from './comment.service';

@Module({
  imports: [TypeOrmModule.forFeature([PropertyComment, Property])],
  controllers: [CommentController],
  providers: [CommentService],
})
export class CommentModule {}
