// Prueba real de propiedades guardadas contra PostgreSQL. Todo ocurre dentro de una transacción que se revierte.
import { ConfigModule } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { Property } from '../src/property/entities/property.entity';
import { PropertyStatus } from '../src/property/property-status.enum';
import { SavedProperty } from '../src/saved-property/entities/saved-property.entity';
import { SavedPropertyService } from '../src/saved-property/saved-property.service';

void ConfigModule.forRoot();

function expect(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: se esperaba ${JSON.stringify(expected)} y llegó ${JSON.stringify(actual)}`);
  }
}

async function expectRejects(label: string, action: Promise<unknown>, status: number) {
  try {
    await action;
  } catch (error) {
    expect(label, (error as { status?: number }).status, status);
    return;
  }
  throw new Error(`${label}: se esperaba un error ${status} y no falló`);
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
    if (!(await runner.hasTable('saved_property'))) {
      throw new Error('Falta la tabla saved_property (reinicia el backend o aplica docs/saved-property-schema.sql)');
    }

    const manager = runner.manager;
    const service = new SavedPropertyService(manager.getRepository(SavedProperty), manager.getRepository(Property));

    const active: { id: number; ownerId: number }[] = await runner.query(
      `SELECT id, "ownerId" FROM property WHERE status = $1 ORDER BY id LIMIT 2`, [PropertyStatus.ACTIVE],
    );
    if (active.length < 2) throw new Error('Se necesitan al menos 2 propiedades ACTIVE para la prueba');
    const [first, second] = active;
    const inactive: { id: number }[] = await runner.query(`SELECT id FROM property WHERE status <> $1 LIMIT 1`, [PropertyStatus.ACTIVE]);
    const tenant: { id: number }[] = await runner.query(
      `SELECT id FROM "user" WHERE id NOT IN ($1, $2) ORDER BY id LIMIT 1`, [first.ownerId, second.ownerId],
    );
    if (!tenant.length) throw new Error('No hay un usuario distinto de los propietarios para la prueba');
    const userId = tenant[0].id;

    expect('empieza sin guardadas', await service.listIds(userId), []);

    expect('guardar', await service.save(userId, first.id), { propertyId: first.id, saved: true });
    expect('guardar otra vez no duplica ni falla', await service.save(userId, first.id), { propertyId: first.id, saved: true });
    await service.save(userId, second.id);
    expect('ids, la más reciente primero', await service.listIds(userId), [second.id, first.id]);

    const list = await service.list(userId);
    expect('lista con 2 tarjetas', list.map((item) => item.id), [second.id, first.id]);
    expect('disponible', list[0].available, true);
    expect('la tarjeta trae propietario sin datos privados', Object.keys(list[0].owner).sort(), ['id', 'name']);
    expect('no expone quién reservó', 'reservedTenantId' in list[0], false);

    await expectRejects('propiedad inexistente', service.save(userId, 2147483000), 404);
    if (inactive.length) await expectRejects('propiedad no activa', service.save(userId, inactive[0].id), 404);
    await expectRejects('propiedad propia', service.save(first.ownerId, first.id), 400);

    // Una guardada que deja de estar activa sigue en la lista, marcada como no disponible.
    await runner.query(`UPDATE property SET status = $1 WHERE id = $2`, [PropertyStatus.INACTIVE, first.id]);
    const afterChange = await service.list(userId);
    expect('sigue en la lista', afterChange.map((item) => item.id), [second.id, first.id]);
    expect('marcada como no disponible', afterChange[1].available, false);

    expect('quitar', await service.remove(userId, first.id), { propertyId: first.id, removed: true });
    expect('quitar otra vez no falla', await service.remove(userId, first.id), { propertyId: first.id, removed: false });
    expect('queda una', await service.listIds(userId), [second.id]);

    // Importación de lo que había en el navegador: ignora propias, inexistentes y repetidas.
    const imported = await service.importMany(userId, [first.id, second.id, second.id, 2147483000]);
    expect('importación', imported, { saved: 1, skipped: 2 });
    expect('ids tras importar', (await service.listIds(userId)).sort(), [second.id]);

    console.log(`Propiedades guardadas verificadas en PostgreSQL (usuario ${userId}). Se revierte toda la prueba.`);
  } finally {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await runner.release();
    await source.destroy();
  }
}
void main().catch((error: Error) => { console.error(error.message); process.exitCode = 1; });
