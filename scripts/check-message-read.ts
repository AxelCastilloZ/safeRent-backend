// Prueba real del estado leído/sin leer contra PostgreSQL. Todo ocurre dentro de una transacción que se revierte.
import { ConfigModule } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { ConversationService } from '../src/messages/conversation/conversation.service';
import { Conversation } from '../src/messages/conversation/entities/conversation.entity';
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
    if (!(await runner.hasColumn('message', 'readAt'))) throw new Error('Falta la columna message.readAt (reinicia el backend o aplica docs/message-read-schema.sql)');

    const rows: { id: number; a: number; b: number }[] = await runner.query(
      `SELECT c.id, MIN(cu."userId") AS a, MAX(cu."userId") AS b
         FROM conversation c JOIN conversation_participants_user cu ON cu."conversationId" = c.id
        GROUP BY c.id HAVING COUNT(*) = 2 ORDER BY c.id LIMIT 1`,
    );
    if (!rows.length) throw new Error('No hay una conversación con dos participantes para verificar');
    const { id: conversationId, a, b } = rows[0];

    const manager = runner.manager;
    const service = new ConversationService(
      manager.getRepository(Conversation), manager.getRepository(User), manager.getRepository(Property), manager.getRepository(Message),
    );
    const send = (senderId: number, text: string) =>
      manager.save(Message, manager.create(Message, { message: text, conversation: { id: conversationId }, sender: { id: senderId } }));

    // Estado inicial de esa conversación (los mensajes antiguos ya deberían estar leídos)
    const unreadFor = async (userId: number) => (await service.countUnread(userId, [conversationId])).get(conversationId) ?? 0;
    const baselineA = await unreadFor(a);
    const baselineB = await unreadFor(b);

    await send(b, 'prueba 1 de b');
    await send(b, 'prueba 2 de b');
    await send(a, 'prueba de a');

    expect('a ve los 2 de b sin leer', await unreadFor(a), baselineA + 2);
    expect('b ve el de a sin leer', await unreadFor(b), baselineB + 1);

    const marked = await service.markRead(conversationId, a);
    expect('a marcó como leídos los 2 de b (y los antiguos que hubiera)', marked.updated, baselineA + 2);
    expect('a ya no tiene pendientes', await unreadFor(a), 0);
    expect('el mensaje de a sigue sin leer para b', await unreadFor(b), baselineB + 1);
    expect('marcar otra vez no cambia nada', (await service.markRead(conversationId, a)).updated, 0);

    const own: { readAt: Date | null }[] = await runner.query(
      `SELECT "readAt" FROM message WHERE "conversationId" = $1 AND "senderId" = $2 AND message = 'prueba de a'`, [conversationId, a],
    );
    expect('un mensaje propio nunca se marca al abrir', own[0].readAt, null);

    console.log(`Leído/sin leer verificado en PostgreSQL (conversación ${conversationId}). Se revierte toda la prueba.`);
  } finally {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await runner.release();
    await source.destroy();
  }
}
void main().catch((error: Error) => { console.error(error.message); process.exitCode = 1; });
