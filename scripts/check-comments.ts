import { ConfigModule } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { CommentService } from '../src/comment/comment.service';
import { Conversation } from '../src/messages/conversation/entities/conversation.entity';

void ConfigModule.forRoot();
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
    const conversation = await runner.manager.getRepository(Conversation).findOne({
      where: {}, relations: { participants: true, property: true }, order: { id: 'ASC' },
    });
    if (!conversation?.property) throw new Error('No hay conversación para comprobar');
    const tenant = conversation.participants.find((user) => user.id !== conversation.property.owner.id);
    if (!tenant) throw new Error('No hay inquilino para comprobar');
    const id = conversation.property.id;
    await runner.query('DELETE FROM property_comment WHERE "propertyId"=$1 AND "authorId"=$2', [id, tenant.id]);
    await runner.query('UPDATE property SET status=$1, "reservedTenantId"=$2 WHERE id=$3', ['ACTIVE', tenant.id, id]);
    const service = new CommentService({
      transaction: (work: (manager: typeof runner.manager) => unknown) => work(runner.manager),
      getRepository: (entity: Parameters<typeof runner.manager.getRepository>[0]) => runner.manager.getRepository(entity),
    } as unknown as DataSource);
    const saved = await service.create(id, tenant.id, { content: 'Comentario temporal de verificación' });
    const list = await service.findByProperty(id);
    const comment = list.find((item) => item.id === saved.id);
    if (!comment || comment.author.id !== tenant.id) throw new Error('No se guardó la relación del comentario');
    if ('email' in comment.author || 'password' in comment.author || 'idCard' in comment.author) throw new Error('El listado expone información privada');
    const admins: { id: number }[] = await runner.query('SELECT ur."userId" AS id FROM user_role ur JOIN role r ON r.id=ur."roleId" WHERE r.name=$1 LIMIT 1', ['ADMIN']);
    if (!admins.length) throw new Error('No hay administrador para comprobar');
    await service.moderate(saved.id, admins[0].id, { hidden: true, note: 'Prueba de moderación' });
    if ((await service.findByProperty(id)).some((item) => item.id === saved.id)) throw new Error('El comentario oculto sigue visible');
    if (!(await service.findOwn(id, tenant.id))?.hidden) throw new Error('No se conserva el comentario del autor');
    const adminList = await service.findForAdmin();
    if (!adminList.some((item) => item.id === saved.id && item.hidden && item.property.id === id)) throw new Error('El administrador no ve el comentario oculto');
    await service.moderate(saved.id, admins[0].id, { hidden: false });
    if (!(await service.findByProperty(id)).some((item) => item.id === saved.id)) throw new Error('No se restauró el comentario');
    let blocked = false;
    try { await service.create(id, conversation.property.owner.id, { content: 'No permitido' }); }
    catch { blocked = true; }
    if (!blocked) throw new Error('El propietario pudo comentar');
    console.log('Comentario, relación, permisos y moderación verificados en PostgreSQL. Se revierte toda la prueba.');
  } finally {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await runner.release();
    await source.destroy();
  }
}
void main().catch((error: Error) => { console.error(error.message); process.exitCode = 1; });
