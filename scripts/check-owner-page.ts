// Prueba real (solo lectura) de la página pública del propietario contra PostgreSQL.
import { ConfigModule } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { Property } from '../src/property/entities/property.entity';
import { PropertyService } from '../src/property/property.service';

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
  try {
    const repo = source.getRepository(Property);
    const service = new PropertyService(repo, null as never, null as never, null as never, null as never, null as never, null as never);

    const owners: { ownerId: number; total: number }[] = await source.query(
      `SELECT "ownerId", count(*)::int AS total FROM property WHERE status = 'ACTIVE' GROUP BY "ownerId" ORDER BY total DESC`,
    );
    console.log('propietarios con propiedades activas:', owners);
    if (owners.length === 0) throw new Error('no hay propiedades activas para probar');

    for (const { ownerId, total } of owners) {
      const profile = await service.findPublicOwner(ownerId);
      expect(`perfil ${ownerId}`, Object.keys(profile).sort(), ['activeProperties', 'id', 'name']);
      expect(`conteo ${ownerId}`, profile.activeProperties, total);

      const list = await service.findAll({ ownerId });
      expect(`listado ${ownerId} total`, list.total, total);
      expect(`listado ${ownerId} solo suyas`, list.data.every((item) => item.ownerId === ownerId && item.status === 'ACTIVE'), true);
      console.log(`propietario ${ownerId} (${profile.name}): ${profile.activeProperties} propiedades, listado ${list.data.length}`);
    }

    const all = await service.findAll({});
    const sum = owners.reduce((acc, owner) => acc + owner.total, 0);
    expect('sin filtro devuelve todas las activas', all.total, sum);

    // Un usuario sin propiedades activas (cualquiera que no esté en la lista) no se puede consultar.
    const [stranger]: { id: number }[] = await source.query(
      `SELECT id FROM "user" WHERE id NOT IN (SELECT "ownerId" FROM property WHERE status = 'ACTIVE') ORDER BY id LIMIT 1`,
    );
    if (stranger) {
      try { await service.findPublicOwner(stranger.id); throw new Error('debía fallar'); } catch (error) {
        expect('usuario sin propiedades activas', (error as { response?: { code?: string } }).response?.code, 'API_PROPIETARIO_NO_DISPONIBLE');
      }
    }
    expect('id inexistente', await service.findPublicOwner(2147483000).catch((error: { response?: { code?: string } }) => error.response?.code), 'API_PROPIETARIO_NO_DISPONIBLE');
    console.log('OK: página pública del propietario');
  } finally {
    await source.destroy();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
