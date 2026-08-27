import { Test, TestingModule } from '@nestjs/testing';
import { IconDescriptionController } from './icon-description.controller';
import { IconDescriptionService } from './icon-description.service';

describe('IconDescriptionController', () => {
  let controller: IconDescriptionController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [IconDescriptionController],
      providers: [IconDescriptionService],
    }).compile();

    controller = module.get<IconDescriptionController>(IconDescriptionController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
