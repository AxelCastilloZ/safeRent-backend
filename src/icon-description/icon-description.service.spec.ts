import { Test, TestingModule } from '@nestjs/testing';
import { IconDescriptionService } from './icon-description.service';

describe('IconDescriptionService', () => {
  let service: IconDescriptionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [IconDescriptionService],
    }).compile();

    service = module.get<IconDescriptionService>(IconDescriptionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
