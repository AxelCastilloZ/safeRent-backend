import { getRepositoryToken } from '@nestjs/typeorm';
import { Message } from './entities/message.entity';
import { User } from '../../user/entities/user.entity';
import { ConversationService } from '../conversation/conversation.service';
import { Test, TestingModule } from '@nestjs/testing';
import { MessageService } from './message.service';

describe('MessageService', () => {
  let service: MessageService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MessageService, { provide: getRepositoryToken(Message), useValue: {} }, { provide: getRepositoryToken(User), useValue: {} }, { provide: ConversationService, useValue: {} }],
    }).compile();

    service = module.get<MessageService>(MessageService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
