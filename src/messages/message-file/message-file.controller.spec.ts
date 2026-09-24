import { Test, TestingModule } from '@nestjs/testing';
import { MessageFileController } from './message-file.controller';
import { MessageFileService } from './message-file.service';

describe('MessageFileController', () => {
  let controller: MessageFileController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MessageFileController],
      providers: [MessageFileService],
    }).compile();

    controller = module.get<MessageFileController>(MessageFileController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
