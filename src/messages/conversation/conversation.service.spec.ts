import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Property } from '../../property/entities/property.entity';
import { PropertyStatus } from '../../property/property-status.enum';
import { User } from '../../user/entities/user.entity';
import { conversationView, messageView } from '../message-views';
import { Message } from '../message/entities/message.entity';
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
  // Constructor de consultas encadenable: cada método devuelve el mismo objeto y el último resuelve el resultado.
  const queryBuilder: Record<string, jest.Mock> = {};
  for (const method of ['select', 'addSelect', 'where', 'andWhere', 'groupBy', 'update', 'set']) {
    queryBuilder[method] = jest.fn(() => queryBuilder);
  }
  queryBuilder.getRawMany = jest.fn();
  queryBuilder.execute = jest.fn();
  const messageRepo = { createQueryBuilder: jest.fn(() => queryBuilder) };

  beforeEach(async () => {
    jest.clearAllMocks();
    propertyRepo.findOneBy.mockResolvedValue(property);
    userRepo.findBy.mockResolvedValue([tenant, owner]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationService,
        { provide: getRepositoryToken(Conversation), useValue: conversationRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(Property), useValue: propertyRepo },
        { provide: getRepositoryToken(Message), useValue: messageRepo },
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
  describe('unread messages', () => {
    it('counts, per conversation, only what the other person sent and nobody has read', async () => {
      queryBuilder.getRawMany.mockResolvedValue([{ conversationId: 9, count: '3' }, { conversationId: 12, count: '1' }]);

      const unread = await service.countUnread(tenant.id, [9, 10, 12]);

      expect(unread.get(9)).toBe(3);
      expect(unread.get(12)).toBe(1);
      expect(unread.get(10)).toBeUndefined(); // sin pendientes: la bandeja lo muestra como 0
      expect(queryBuilder.andWhere).toHaveBeenCalledWith('"message"."senderId" != :userId', { userId: tenant.id });
      expect(queryBuilder.andWhere).toHaveBeenCalledWith('"message"."readAt" IS NULL');
    });

    it('does not query when the inbox is empty', async () => {
      expect((await service.countUnread(tenant.id, [])).size).toBe(0);
      expect(messageRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('marks as read only what the other person sent, and reports how many', async () => {
      queryBuilder.execute.mockResolvedValue({ affected: 2 });

      await expect(service.markRead(9, tenant.id)).resolves.toEqual({ updated: 2 });
      expect(queryBuilder.where).toHaveBeenCalledWith('"conversationId" = :conversationId', { conversationId: 9 });
      expect(queryBuilder.andWhere).toHaveBeenCalledWith('"senderId" != :userId', { userId: tenant.id });
      expect(queryBuilder.andWhere).toHaveBeenCalledWith('"readAt" IS NULL');
    });

    it('shows readAt in messages and unreadCount only where it is calculated', () => {
      const sentAt = new Date('2026-10-08T10:00:00Z');
      const message = { id: 1, message: 'Hola', createdAt: sentAt, readAt: undefined, sender: tenant };
      expect(messageView(message as never).readAt).toBeNull();
      expect(messageView({ ...message, readAt: sentAt } as never).readAt).toBe(sentAt);

      const conversation = { id: 9, createdAt: sentAt, participants: [tenant, owner], property };
      expect(conversationView(conversation as never, 4)).toMatchObject({ unreadCount: 4 });
      expect(conversationView(conversation as never)).not.toHaveProperty('unreadCount');
    });
  });
});
