import { AppRole, Roles } from '../../auth/access';
import type { AuthRequest } from '../../auth/access';
import { AccessTo } from '../../auth/guard/resource-access.guard';
import {
    Controller,
    Get,
    Post,
    Req,
    Param,
    Delete,
    UseInterceptors,
    UploadedFiles,
    BadRequestException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { randomUUID } from 'node:crypto';
import { extname } from 'path';
import { MessageFileService } from './message-file.service';

@Roles(AppRole.CLIENT, AppRole.OWNER)
@Controller('messages/:messageId/files')
export class MessageFileController {
    constructor(private readonly messageFileService: MessageFileService) {}

    @AccessTo('message')
    @Post()
    @UseInterceptors(
        FilesInterceptor('files', 10, {
            storage: diskStorage({
                destination: './uploads',
                filename: (_req, file, cb) => cb(null, randomUUID() + extname(file.originalname)),
            }),
            limits: { fileSize: 10 * 1024 * 1024 },
            fileFilter: (_req, file, cb) => {
                if (['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.mimetype)) cb(null, true);
                else cb(new BadRequestException('Formato de archivo no permitido.'), false);
            },
        }),
    )
    upload(
        @Param('messageId') messageId: number,
        @UploadedFiles() files: Express.Multer.File[],
        @Req() req: AuthRequest,
    ) {
        return this.messageFileService.uploadMany(messageId, files, `${req.user.name} ${req.user.surname1}`);
    }

    @AccessTo('message')
    @Get(':fileId/download')
    download(@Param('messageId') messageId: number, @Param('fileId') fileId: number) {
        return this.messageFileService.download(messageId, fileId);
    }

    @AccessTo('message')
    @Get()
    findAll(@Param('messageId') messageId: number) {
        return this.messageFileService.list(messageId);
    }

    @AccessTo('message')
    @Delete(':fileId')
    remove(@Param('messageId') messageId: number, @Param('fileId') fileId: number) {
        return this.messageFileService.remove(messageId, fileId);
    }
}
