import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Property } from '../../property/entities/property.entity';
import { PropertyStatus } from '../../property/property-status.enum';
import { User } from '../../user/entities/user.entity';
import { conversationView } from '../message-views';
import { ConversationService } from './conversation.service';
import { Conversation } from './entities/conversation.entity';

describe('ConversationService', () => {
  const tenant = { id: 1, name: 'Ana', surname1: 'Prueba' };
  const owner = { id: 2, name: 'Pedro', surname1: 'Dueño', isActive: true };
  const property = {
    id: 5,
    title: 'Apartamento',
    status: PropertyStatus.ACTIVE,
    owner,
    reservedTenantId: null,
    reservedAt: null,
  };

  let service: ConversationService;
  const conversationRepo = { find: jest.fn(), create: jest.fn(), save: jest.fn() };
  const userRepo = { findBy: jest.fn() };
  const propertyRepo = { findOneBy: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    propertyRepo.findOneBy.mockResolvedValue(property);
    userRepo.findBy.mockResolvedValue([tenant, owner]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationService,
        { provide: getRepositoryToken(Conversation), useValue: conversationRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(Property), useValue: propertyRepo },
      ],
    }).compile();

    service = module.get(ConversationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('returns the existing conversation WITH its property so it can be serialized (second click on "Chatear")', async () => {
    // El repositorio simulado respeta `relations`, como TypeORM: sin `property` en la consulta no la devuelve.
    conversationRepo.find.mockImplementation(({ relations }: { relations: Record<string, boolean> }) =>
      Promise.resolve([
        {
          id: 9,
          createdAt: new Date('2026-10-07T21:00:00Z'),
          participants: [tenant, owner],
          ...(relations.property ? { property } : {}),
        },
      ]),
    );

    const conversation = await service.createForUser(property.id, tenant.id);

    expect(conversation.id).toBe(9);
    expect(conversationRepo.save).not.toHaveBeenCalled();
    // Esto es lo que reventaba: "Cannot read properties of undefined (reading 'id')".
    expect(conversationView(conversation as Conversation)).toMatchObject({
      id: 9,
      property: { id: 5, title: 'Apartamento', owner: { id: 2, name: 'Pedro' } },
    });
  });

  it('creates a new conversation when there is none for that property and those participants', async () => {
    conversationRepo.find.mockResolvedValue([]);
    conversationRepo.create.mockImplementation((data: object) => data);
    conversationRepo.save.mockImplementation((data: object) => Promise.resolve({ id: 10, ...data }));

    const conversation = await service.createForUser(property.id, tenant.id);

    expect(conversation.id).toBe(10);
    expect(conversationRepo.save).toHaveBeenCalledTimes(1);
  });

  it('does not let the owner open a chat with themselves', async () => {
    await expect(service.createForUser(property.id, owner.id)).rejects.toBeInstanceOf(BadRequestException);
    expect(conversationRepo.find).not.toHaveBeenCalled();
  });
});
