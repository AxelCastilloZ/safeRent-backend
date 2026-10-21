// Prueba real de la conversación directa administrador ↔ usuario contra PostgreSQL.
// Todo ocurre dentro de una transacción que se revierte: no queda ninguna conversación ni mensaje.
import { ConfigModule } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { ConversationService } from '../src/messages/conversation/conversation.service';
import { Conversation } from '../src/messages/conversation/entities/conversation.entity';
import { conversationView } from '../src/messages/message-views';
import { Message } from '../src/messages/message/entities/message.entity';
import { Property } from '../src/property/entities/property.entity';
import { User } from '../src/user/entities/user.entity';

void ConfigModule.forRoot();

function expect(label: string, actual: unknown, expected: unknown) {
  if (actual !== expected) throw new Error(`${label}: se esperaba ${String(expected)} y llegó ${String(actual)}`);
}

async function main() {
  const source = new DataSource({
    type: 'postgres', host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432),
    username: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE,
    entities: [__dirname + '/../src/**/*.entity.ts'], synchronize: false,
  });
  await source.initialize();
  const runner = source.createQueryRunner();
  try {
    await runner.startTransaction();

    const [admin]: { id: number }[] = await runner.query(
      `SELECT u.id FROM "user" u JOIN user_role ur ON ur."userId" = u.id JOIN role r ON r.id = ur."roleId"
        WHERE r.name = 'ADMIN' ORDER BY u."isActive" DESC, u.id LIMIT 1`,
    );
    const [target]: { id: number }[] = await runner.query(
      `SELECT u.id FROM "user" u WHERE u."isActive"
          AND NOT EXISTS (SELECT 1 FROM user_role ur JOIN role r ON r.id = ur."roleId" WHERE ur."userId" = u.id AND r.name = 'ADMIN')
        ORDER BY u.id LIMIT 1`,
    );
    if (!admin || !target) throw new Error('Se necesita un administrador y otro usuario activo para verificar');

    const manager = runner.manager;
    const service = new ConversationService(
      manager.getRepository(Conversation), manager.getRepository(User), manager.getRepository(Property), manager.getRepository(Message),
    );

    const first = await service.createDirect(admin.id, target.id);
    expect('la conversación directa no tiene propiedad', first.property, null);
    const again = await service.createDirect(admin.id, target.id);
    expect('crearla otra vez devuelve la misma', again.id, first.id);

    const view = conversationView(first);
    expect('hay 2 participantes', view.participants.length, 2);
    expect('los participantes traen sus roles', view.participants.every((p) => Array.isArray(p.roles) && p.roles.length > 0), true);

    await manager.save(Message, manager.create(Message, { message: 'Hola desde administración', conversation: { id: first.id }, sender: { id: admin.id } }));
    expect('el usuario tiene 1 mensaje sin leer del administrador', (await service.countUnread(target.id, [first.id])).get(first.id), 1);
    expect('el administrador no tiene pendientes de sí mismo', (await service.countUnread(admin.id, [first.id])).get(first.id) ?? 0, 0);

    const inbox = await service.findByParticipant(target.id);
    const listed = inbox.find((conversation) => conversation.id === first.id);
    expect('aparece en la bandeja del usuario', Boolean(listed), true);
    expect('la bandeja la serializa sin propiedad', conversationView(listed as Conversation, 1).property, null);

    expect('marcar como leído por el usuario', (await service.markRead(first.id, target.id)).updated, 1);
    expect('ya no quedan pendientes', (await service.countUnread(target.id, [first.id])).get(first.id) ?? 0, 0);

    for (const [label, adminId, userId] of [
      ['rechaza chatear contigo mismo', admin.id, admin.id],
      ['rechaza a otro administrador', target.id, admin.id],
    ] as const) {
      let rejected = false;
      try { await service.createDirect(adminId, userId); } catch { rejected = true; }
      expect(label, rejected, true);
    }

    console.log(`Conversación directa verificada en PostgreSQL (administrador ${admin.id} ↔ usuario ${target.id}). Se revierte toda la prueba.`);
  } finally {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await runner.release();
    await source.destroy();
  }
}
void main().catch((error: Error) => { console.error(error.message); process.exitCode = 1; });
