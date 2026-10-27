import { getRepositoryToken } from '@nestjs/typeorm';
import { MessageFile } from './entities/message-file.entity';
import { MessageService } from '../message/message.service';
import { Test, TestingModule } from '@nestjs/testing';
import { MessageFileService } from './message-file.service';

describe('MessageFileService', () => {
  let service: MessageFileService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MessageFileService, { provide: getRepositoryToken(MessageFile), useValue: {} }, { provide: MessageService, useValue: {} }],
    }).compile();

    service = module.get<MessageFileService>(MessageFileService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
