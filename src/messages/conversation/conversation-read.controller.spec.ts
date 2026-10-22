import { AppRole, ROLES_KEY } from '../../auth/access';
import { MessageController } from '../message/message.controller';
import { ConversationController } from './conversation.controller';

describe('PATCH /conversations/:id/read', () => {
  const markRead = jest.fn().mockResolvedValue({ updated: 2 });
  const controller = new ConversationController({ markRead } as never);

  it('marks as read on behalf of the token user, never a user sent by the client', async () => {
    const result = await controller.markRead(9, { user: { id: 7 } } as never);

    expect(markRead).toHaveBeenCalledWith(9, 7);
    expect(result).toEqual({ updated: 2 });
  });

  it('is limited to conversation participants', () => {
    // 'auth:resource' es la clave que lee ResourceAccessGuard: valida que el usuario participe en la conversación.
    expect(Reflect.getMetadata('auth:resource', ConversationController.prototype.markRead)).toBe('conversation');
  });
});

describe('Direct conversations (administrador ↔ usuario)', () => {
  const createDirect = jest.fn();
  const controller = new ConversationController({ createDirect } as never);

  it('lets admins into the messaging controllers, next to tenants and owners', () => {
    const everyone = [AppRole.CLIENT, AppRole.OWNER, AppRole.ADMIN];
    expect(Reflect.getMetadata(ROLES_KEY, ConversationController)).toEqual(everyone);
    expect(Reflect.getMetadata(ROLES_KEY, MessageController)).toEqual(everyone);
  });

  it('only admins start direct conversations; tenants keep starting them from a property', () => {
    expect(Reflect.getMetadata(ROLES_KEY, ConversationController.prototype.createDirect)).toEqual([AppRole.ADMIN]);
    expect(Reflect.getMetadata(ROLES_KEY, ConversationController.prototype.create)).toEqual([AppRole.CLIENT]);
  });

  it('starts the conversation as the token admin with the user chosen in the body', async () => {
    createDirect.mockResolvedValue({
      id: 20, createdAt: new Date('2026-10-20T10:00:00Z'),
      participants: [{ id: 99, name: 'Admin', surname1: 'Sistema' }, { id: 1, name: 'Ana', surname1: 'Prueba' }],
      property: null,
    });

    const view = await controller.createDirect({ userId: 1 }, { user: { id: 99 } } as never);

    expect(createDirect).toHaveBeenCalledWith(99, 1);
    expect(view).toMatchObject({ id: 20, property: null });
  });
});
