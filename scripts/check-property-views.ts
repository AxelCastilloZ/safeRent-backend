// Prueba real de las vistas de propiedades contra PostgreSQL. Todo ocurre dentro de una transacción que se revierte.
import { ConfigModule } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { PropertyViews1793318400000 } from '../src/migrations/1793318400000-property-views';
import { PropertyViewService } from '../src/property-view/property-view.service';

void ConfigModule.forRoot();

function expect(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label}: se esperaba ${JSON.stringify(expected)} y llegó ${JSON.stringify(actual)}`);
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
    await new PropertyViews1793318400000().up(runner);

    const [active]: { id: number }[] = await runner.query(`SELECT id FROM property WHERE status = 'ACTIVE' ORDER BY id LIMIT 1`);
    const [other]: { id: number }[] = await runner.query(`SELECT id FROM property WHERE status = 'ACTIVE' AND id <> $1 ORDER BY id LIMIT 1`, [active.id]);
    const [unpublished]: { id: number }[] = await runner.query(`SELECT id FROM property WHERE status <> 'ACTIVE' ORDER BY id LIMIT 1`);

    const fake = {
      getRepository: (entity: never) => runner.manager.getRepository(entity),
      query: (sql: string, params?: unknown[]) => runner.query(sql, params),
    } as unknown as DataSource;
    const service = new PropertyViewService(fake);

    expect('sin vistas al inicio', await service.views(active.id), { propertyId: active.id, views: 0 });
    expect('primera persona', (await service.record(active.id, 'visitor-aaaaaaaaaaaaaaaa')).views, 1);
    expect('la misma persona otra vez no suma', (await service.record(active.id, 'visitor-aaaaaaaaaaaaaaaa')).views, 1);
    expect('otra persona suma', (await service.record(active.id, 'visitor-bbbbbbbbbbbbbbbb')).views, 2);
    expect('consultar no registra', (await service.views(active.id)).views, 2);
    expect('otra propiedad cuenta aparte', (await service.record(other.id, 'visitor-aaaaaaaaaaaaaaaa')).views, 1);

    const [{ n }] = await runner.query('SELECT count(*)::int AS n FROM property_view WHERE "propertyId" = $1', [active.id]);
    expect('una fila por persona', n, 2);

    if (unpublished) {
      for (const action of [() => service.record(unpublished.id, 'visitor-cccccccccccccccc'), () => service.views(unpublished.id)]) {
        try { await action(); throw new Error('debía fallar'); } catch (error) {
          expect('propiedad no publicada', (error as { response?: { code?: string } }).response?.code, 'API_PROPIEDAD_NO_DISPONIBLE');
        }
      }
    }
    console.log('OK: vistas de propiedades (personas distintas, sin repetir, solo publicadas)');
  } finally {
    await runner.rollbackTransaction();
    await runner.release();
    await source.destroy();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
