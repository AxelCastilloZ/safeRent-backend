import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Req } from '@nestjs/common';
import { AppRole, Public, Roles } from '../auth/access';
import type { AuthRequest } from '../auth/access';
import { CreateCommentDto } from './dto/create-comment.dto';
import { ModerateCommentDto } from './dto/moderate-comment.dto';
import { CommentService } from './comment.service';

@Controller('comments')
export class CommentController {
  constructor(private readonly comments: CommentService) {}

  @Roles(AppRole.ADMIN)
  @Get('admin')
  findForAdmin() {
    return this.comments.findForAdmin();
  }

  @Roles(AppRole.ADMIN)
  @Patch(':id/moderation')
  moderate(@Param('id', ParseIntPipe) id: number, @Body() dto: ModerateCommentDto, @Req() req: AuthRequest) {
    return this.comments.moderate(id, req.user.id, dto);
  }

  @Get('property/:propertyId/me')
  findOwn(@Param('propertyId', ParseIntPipe) propertyId: number, @Req() req: AuthRequest) {
    return this.comments.findOwn(propertyId, req.user.id);
  }

  @Public()
  @Get('property/:propertyId')
  findByProperty(@Param('propertyId', ParseIntPipe) propertyId: number) {
    return this.comments.findByProperty(propertyId);
  }

  @Roles(AppRole.CLIENT)
  @Post('property/:propertyId')
  create(@Param('propertyId', ParseIntPipe) propertyId: number, @Body() dto: CreateCommentDto, @Req() req: AuthRequest) {
    return this.comments.create(propertyId, req.user.id, dto);
  }
}
