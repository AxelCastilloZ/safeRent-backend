import { AppRole, ROLES_KEY } from '../../auth/access';
import { ConversationController } from './conversation.controller';

describe('PATCH /conversations/:id/read', () => {
  const markRead = jest.fn().mockResolvedValue({ updated: 2 });
  const controller = new ConversationController({ markRead } as never);

  it('marks as read on behalf of the token user, never a user sent by the client', async () => {
    const result = await controller.markRead(9, { user: { id: 7 } } as never);

    expect(markRead).toHaveBeenCalledWith(9, 7);
    expect(result).toEqual({ updated: 2 });
  });

  it('is limited to conversation participants with a tenant or owner account', () => {
    // 'auth:resource' es la clave que lee ResourceAccessGuard: valida que el usuario participe en la conversación.
    expect(Reflect.getMetadata('auth:resource', ConversationController.prototype.markRead)).toBe('conversation');
    expect(Reflect.getMetadata(ROLES_KEY, ConversationController)).toEqual([AppRole.CLIENT, AppRole.OWNER]);
  });
});
