import { BadRequestException, CanActivate, ExecutionContext, ForbiddenException, Injectable, NotFoundException, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { Property } from '../../property/entities/property.entity';
import { Conversation } from '../../messages/conversation/entities/conversation.entity';
import { Message } from '../../messages/message/entities/message.entity';
import type { AuthRequest } from '../access';

type Resource = 'property' | 'owner-list' | 'conversation' | 'inbox' | 'message';
const KEY = 'auth:resource';
export const AccessTo = (resource: Resource) => SetMetadata(KEY, resource);

@Injectable()
export class ResourceAccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly source: DataSource) {}

  async canActivate(context: ExecutionContext) {
    const resource = this.reflector.get<Resource>(KEY, context.getHandler());
    if (!resource) return true;
    const req = context.switchToHttp().getRequest<AuthRequest>();
    const user = req.user;
    const resourceId = (value: unknown) => {
      const id = Number(value);
      if (!Number.isSafeInteger(id) || id <= 0) throw new BadRequestException('Identificador inválido');
      return id;
    };
    if (resource === 'owner-list' || resource === 'inbox') {
      const id = resourceId(req.params[resource === 'inbox' ? 'userId' : 'ownerId']);
      if (id !== user.id && !(resource === 'owner-list' && user.roles.includes('ADMIN'))) {
        throw new ForbiddenException('No puedes consultar los datos de otro usuario');
      }
      return true;
    }
    if (resource === 'property') {
      const property = await this.source.getRepository(Property).findOneBy({ id: resourceId(req.params.id) });
      if (!property) throw new NotFoundException('Propiedad no encontrada');
      if (property.ownerId !== user.id && !user.roles.includes('ADMIN')) throw new ForbiddenException('Esta propiedad no te pertenece');
      return true;
    }
    let conversationId = resource === 'message' ? 0 : resourceId(req.params.conversationId ?? req.params.id);
    if (resource === 'message') {
      const message = await this.source.getRepository(Message).findOne({
        where: { id: resourceId(req.params.messageId) }, relations: { sender: true, conversation: true },
      });
      if (!message) throw new NotFoundException('Mensaje no encontrado');
      if (req.method !== 'GET' && message.sender.id !== user.id) throw new ForbiddenException('Solo el remitente puede modificar los adjuntos');
      conversationId = message.conversation.id;
    }
    const conversation = await this.source.getRepository(Conversation).findOne({
      where: { id: conversationId }, relations: { participants: true },
    });
    if (!conversation) throw new NotFoundException('Conversación no encontrada');
    if (!conversation.participants.some((participant) => participant.id === user.id)) throw new ForbiddenException('No participas en esta conversación');
    return true;
  }
}
