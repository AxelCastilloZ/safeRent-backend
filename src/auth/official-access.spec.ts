import { ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import type { Server } from 'node:http';
import { PropertyController } from '../property/property.controller';
import { PropertyService } from '../property/property.service';
import { LocationService } from '../property/location.service';
import { ConversationController } from '../messages/conversation/conversation.controller';
import { ConversationService } from '../messages/conversation/conversation.service';
import { MessageController } from '../messages/message/message.controller';
import { MessageFileController } from '../messages/message-file/message-file.controller';
import { MessageFileService } from '../messages/message-file/message-file.service';
import { MessageService } from '../messages/message/message.service';
import { RoleController } from '../role/role.controller';
import { RoleService } from '../role/role.service';
import { ServiceController } from '../service/service.controller';
import { ServiceService } from '../service/service.service';
import { Property } from '../property/entities/property.entity';
import { Conversation } from '../messages/conversation/entities/conversation.entity';
import { RolesGuard } from './guard/roles.guard';
import { ResourceAccessGuard } from './guard/resource-access.guard';
import { PUBLIC_KEY } from './access';

describe('Official role and resource access', () => {
  let app: INestApplication;
  const reflector = new Reflector();
  const actors = {
    client: { id: 2, roles: ['CLIENT'] },
    owner: { id: 1, roles: ['OWNER'] },
    outsider: { id: 3, roles: ['OWNER'] },
    admin: { id: 4, roles: ['ADMIN'] },
  };
  const property = { id: 5, title: 'Casa', status: 'ACTIVE', ownerId: 1, owner: { id: 1, name: 'Ana' } };
  const conversation = { id: 8, property, participants: [{ id: 1, name: 'Ana' }, { id: 2, name: 'Luis' }] };
  const properties = { findAll: () => [], findPublic: () => property, findOne: () => property, update: () => property, findByOwner: () => [] };
  const conversations = { findOne: () => conversation, findByParticipant: () => [conversation], createForUser: jest.fn().mockResolvedValue(conversation) };
  const messages = { findByConversation: () => [], create: jest.fn().mockImplementation((_id: number, dto: { message: string; senderId: number }) => ({ id: 9, message: dto.message, sender: { id: dto.senderId } })) };
  const source = { getRepository: (entity: unknown) => entity === Property
    ? { findOneBy: () => property }
    : entity === Conversation ? { findOne: () => conversation } : { findOne: () => ({ sender: { id: 1 }, conversation: { id: 8 } }) } };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PropertyController, ConversationController, MessageController, MessageFileController, RoleController, ServiceController],
      providers: [
        { provide: PropertyService, useValue: properties }, { provide: LocationService, useValue: {} },
        { provide: ConversationService, useValue: conversations }, { provide: MessageService, useValue: messages },
        { provide: MessageFileService, useValue: { list: () => [] } },
        { provide: RoleService, useValue: { findAll: () => [] } }, { provide: ServiceService, useValue: { findAll: () => [] } },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalGuards({
      canActivate(context: ExecutionContext) {
        if (reflector.getAllAndOverride(PUBLIC_KEY, [context.getHandler(), context.getClass()])) return true;
        const req = context.switchToHttp().getRequest<{ headers: Record<string, string>; user?: object }>();
        const actor = actors[req.headers['x-test-actor'] as keyof typeof actors];
        if (!actor) throw new UnauthorizedException();
        req.user = actor;
        return true;
      },
    }, new RolesGuard(reflector), new ResourceAccessGuard(reflector, source as unknown as DataSource));
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });
  afterAll(async () => { await app.close(); });
  it('keeps the catalog public but requires login to select a property', async () => {
    await request(app.getHttpServer() as Server).get('/properties').expect(200);
    await request(app.getHttpServer() as Server).get('/properties/active/5').expect(401);
    await request(app.getHttpServer() as Server).get('/properties/active/5').set('x-test-actor', 'client').expect(200);
  });
  it('does not make role creation public', async () => {
    await request(app.getHttpServer() as Server).post('/roles').send({}).expect(401);
    await request(app.getHttpServer() as Server).get('/roles').set('x-test-actor', 'client').expect(403);
    await request(app.getHttpServer() as Server).get('/roles').set('x-test-actor', 'admin').expect(200);
  });
  it('allows public service listing but blocks client changes', async () => {
    await request(app.getHttpServer() as Server).get('/service').expect(200);
    await request(app.getHttpServer() as Server).post('/service').set('x-test-actor', 'client').send({}).expect(403);
  });
  it('only allows an owner or administrator to edit the property', async () => {
    for (const actor of ['client', 'outsider']) await request(app.getHttpServer() as Server).patch('/properties/5').set('x-test-actor', actor).send({ title: 'Casa' }).expect(403);
    for (const actor of ['owner', 'admin']) await request(app.getHttpServer() as Server).patch('/properties/5').set('x-test-actor', actor).send({ title: 'Casa' }).expect(200);
  });
  it('protects private property details and owner lists', async () => {
    await request(app.getHttpServer() as Server).get('/properties/5').set('x-test-actor', 'client').expect(403);
    await request(app.getHttpServer() as Server).get('/properties/owner/1').set('x-test-actor', 'outsider').expect(403);
    await request(app.getHttpServer() as Server).get('/properties/owner/1').set('x-test-actor', 'owner').expect(200);
  });
  it('protects conversations, histories and inboxes from outsiders', async () => {
    for (const path of ['/conversations/8', '/conversations/8/messages', '/conversations/user/1']) {
      await request(app.getHttpServer() as Server).get(path).set('x-test-actor', 'outsider').expect(403);
    }
    await request(app.getHttpServer() as Server).get('/conversations/8').set('x-test-actor', 'client').expect(200);
    await request(app.getHttpServer() as Server).get('/conversations/8').set('x-test-actor', 'admin').expect(403);
  });
  it('protects attachments before processing an upload', async () => {
    await request(app.getHttpServer() as Server).get('/messages/9/files').set('x-test-actor', 'outsider').expect(403);
    await request(app.getHttpServer() as Server).post('/messages/9/files').set('x-test-actor', 'client').expect(403);
    await request(app.getHttpServer() as Server).get('/messages/9/files').set('x-test-actor', 'client').expect(200);
  });
  it('takes conversation participants from the authenticated client and property', async () => {
    await request(app.getHttpServer() as Server).post('/conversations').set('x-test-actor', 'client').send({ propertyId: 5, participantIds: [3, 4] }).expect(201);
    expect(conversations.createForUser).toHaveBeenCalledWith(5, 2);
  });
  it('takes the message sender from the token', async () => {
    await request(app.getHttpServer() as Server).post('/conversations/8/messages').set('x-test-actor', 'client').send({ message: 'Hola', senderId: 1 }).expect(201);
    expect(messages.create).toHaveBeenCalledWith(8, expect.objectContaining({ senderId: 2 }));
  });
});
