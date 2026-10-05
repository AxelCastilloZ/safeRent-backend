import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import { MessageFile } from './entities/message-file.entity';
import { MessageService } from '../message/message.service';

@Injectable()
export class MessageFileService {
  constructor(
    @InjectRepository(MessageFile)
    private readonly messageFileRepo: Repository<MessageFile>,

    private readonly messageService: MessageService,
  ) {}

  async uploadMany(messageId: number, files: Express.Multer.File[], uploadedBy?: string) {
    if (!files?.length) {
      throw new BadRequestException('No files were provided');
    }

    const message = await this.messageService.findOne(messageId);

    const messageFiles = files.map((file) =>
      this.messageFileRepo.create({
        path: file.path,
        fileName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        uploadedBy,
        message,
      }),
    );

    return await this.messageFileRepo.save(messageFiles);
  }

  async list(messageId: number) {
    await this.messageService.findOne(messageId);

    return await this.messageFileRepo.find({
      where: { message: { id: messageId } },
      order: { uploadedAt: 'DESC' },
    });
  }

  async remove(messageId: number, fileId: number) {
    await this.messageService.findOne(messageId);

    const file = await this.messageFileRepo.findOne({
      where: { id: fileId, message: { id: messageId } },
    });

    if (!file) {
      throw new NotFoundException(`File with Id ${fileId} not found for message ${messageId}`);
    }

    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }

    return await this.messageFileRepo.remove(file);
  }
}
