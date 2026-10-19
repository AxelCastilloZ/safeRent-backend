import { User } from '../user/entities/user.entity';
import { Conversation } from './conversation/entities/conversation.entity';
import { Message } from './message/entities/message.entity';

export function participantView(user: User) {
  return { id: user.id, name: user.name, surname1: user.surname1, surname2: user.surname2 };
}

/** `unreadCount` solo se envía donde se calcula (la bandeja del usuario); en el resto de respuestas se omite. */
export function conversationView(conversation: Conversation, unreadCount?: number) {
  const property = conversation.property;
  return {
    id: conversation.id, createdAt: conversation.createdAt,
    ...(unreadCount === undefined ? {} : { unreadCount }),
    participants: conversation.participants.map(participantView),
    property: {
      id: property.id, title: property.title, status: property.status,
      owner: { id: property.owner.id, name: property.owner.name },
      reservedTenantId: property.reservedTenantId,
      reservedAt: property.reservedAt,
    },
  };
}

export function messageView(message: Message) {
  return {
    id: message.id, message: message.message, createdAt: message.createdAt,
    readAt: message.readAt ?? null,
    sender: participantView(message.sender),
  };
}
