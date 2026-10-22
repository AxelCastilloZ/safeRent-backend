import { DropboxService } from '../../dropbox/dropbox.service';
import { StreamableFile, BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
    private readonly dropbox: DropboxService = undefined!,
  ) {}

  async uploadMany(messageId: number, files: Express.Multer.File[], uploadedBy?: string) {
    if (!files?.length) {
      throw new BadRequestException('No files were provided');
    }

    const message = await this.messageService.findOne(messageId);

    const uploaded: string[] = [];
    try {
      const rows: MessageFile[] = [];
      for (const file of files) {
        const stored = await this.dropbox.upload(file, `Mensajes/${messageId}/Adjuntos`, false);
        uploaded.push(stored.path);
        rows.push(this.messageFileRepo.create({ path: stored.path, rev: stored.rev, storage: 'dropbox', fileName: file.originalname, mimeType: file.mimetype, size: file.size, uploadedBy, message }));
      }
      return await this.messageFileRepo.save(rows);
    } catch (error) {
      await Promise.allSettled(uploaded.map(path => this.dropbox.delete(path)));
      throw error;
    }
  }

  async download(messageId: number, fileId: number) {
    const file = await this.messageFileRepo.findOneBy({ id: fileId, message: { id: messageId } });
    if (!file) throw new NotFoundException('Archivo no encontrado');
    if (file.storage === 'dropbox') {
      const response = await fetch(await this.dropbox.temporaryLink(file.path), { signal: AbortSignal.timeout(60000) });
      if (!response.ok) throw new NotFoundException('Archivo no disponible');
      return new StreamableFile(Buffer.from(await response.arrayBuffer()), { type: file.mimeType, disposition: `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}` });
    }
    if (!fs.existsSync(file.path)) throw new NotFoundException('Archivo no encontrado');
    return new StreamableFile(fs.createReadStream(file.path), {
      type: file.mimeType,
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    });
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

    if (file.storage === 'dropbox') await this.dropbox.delete(file.path);
    else if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }

    return await this.messageFileRepo.remove(file);
  }
}
