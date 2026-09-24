import { Test, TestingModule } from '@nestjs/testing';
import { MessageFileService } from './message-file.service';

describe('MessageFileService', () => {
  let service: MessageFileService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MessageFileService],
    }).compile();

    service = module.get<MessageFileService>(MessageFileService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
