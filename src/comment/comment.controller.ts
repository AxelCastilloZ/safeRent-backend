import { Body, Controller, Get, Param, ParseIntPipe, Post, Req } from '@nestjs/common';
import { Public } from '../auth/access';
import type { AuthRequest } from '../auth/access';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CommentService } from './comment.service';

@Controller('comments')
export class CommentController {
  constructor(private readonly comments: CommentService) {}

  @Public()
  @Get('property/:propertyId')
  findByProperty(@Param('propertyId', ParseIntPipe) propertyId: number) {
    return this.comments.findByProperty(propertyId);
  }

  @Post('property/:propertyId')
  create(@Param('propertyId', ParseIntPipe) propertyId: number, @Body() dto: CreateCommentDto, @Req() req: AuthRequest) {
    return this.comments.create(propertyId, req.user.id, dto);
  }
}
