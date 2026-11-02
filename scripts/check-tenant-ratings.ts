// Prueba real de las calificaciones de inquilinos contra PostgreSQL. Todo ocurre dentro de una transacción que se revierte.
import { ConfigModule } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { TenantRatings1793232000000 } from '../src/migrations/1793232000000-tenant-ratings';
import { TenantRatingService } from '../src/tenant-rating/tenant-rating.service';

void ConfigModule.forRoot();

function expect(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label}: se esperaba ${JSON.stringify(expected)} y llegó ${JSON.stringify(actual)}`);
}

async function code(label: string, action: Promise<unknown>, expected: string) {
  try {
    await action;
  } catch (error) {
    const body = (error as { response?: { code?: string } }).response;
    expect(label, body?.code ?? (error as Error).message, expected);
    return;
  }
  throw new Error(`${label}: se esperaba el error ${expected} y no falló`);
}

async function sqlFails(label: string, runner: { query: (sql: string, params?: unknown[]) => Promise<unknown> }, sql: string, params: unknown[]) {
  await runner.query('SAVEPOINT attempt');
  try {
    await runner.query(sql, params);
  } catch {
    await runner.query('ROLLBACK TO SAVEPOINT attempt');
    return;
  }
  throw new Error(`${label}: la base debía rechazarlo y lo aceptó`);
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
    // La tabla se crea con la propia migración (dentro de la transacción: se revierte con todo lo demás).
    await new TenantRatings1793232000000().up(runner);

    const owners: { ownerId: number; propertyId: number }[] = await runner.query(
      `SELECT DISTINCT ON ("ownerId") "ownerId", id AS "propertyId" FROM property ORDER BY "ownerId", id LIMIT 2`,
    );
    if (owners.length < 2) throw new Error('hacen falta dos propietarios con propiedades para probar');
    const [first, second] = owners;
    const [tenant]: { id: number }[] = await runner.query(
      `SELECT u.id FROM "user" u JOIN user_role ur ON ur."userId" = u.id JOIN role r ON r.id = ur."roleId"
       WHERE r.name = 'CLIENT' AND u.id NOT IN ($1, $2) ORDER BY u.id LIMIT 1`,
      [first.ownerId, second.ownerId],
    );

    // Dos reservas terminadas del mismo inquilino, cada una con un propietario distinto.
    const reservation = async (owner: { ownerId: number; propertyId: number }) => (await runner.query(
      `INSERT INTO reservation ("startedAt", "endedAt", "endReason", "propertyId", "tenantId", "ownerId")
       VALUES (now() - interval '40 days', now() - interval '10 days', 'prueba', $1, $2, $3) RETURNING id`,
      [owner.propertyId, tenant.id, owner.ownerId],
    ) as { id: number }[])[0].id;
    const resA = await reservation(first);
    const resB = await reservation(second);

    const manager = runner.manager;
    const fake = {
      getRepository: (entity: never) => manager.getRepository(entity),
      query: (sql: string, params?: unknown[]) => runner.query(sql, params),
    } as unknown as DataSource;
    const service = new TenantRatingService(fake);
    const ownerA = { id: first.ownerId, roles: ['OWNER'] };
    const ownerB = { id: second.ownerId, roles: ['OWNER'] };

    // Calificar, y editar: sigue siendo una sola calificación por reserva.
    const created = await service.rate(resA, first.ownerId, { rating: 5, comment: '  Puntual y cuidadoso  ' });
    expect('comentario sin espacios sobrantes', created.comment, 'Puntual y cuidadoso');
    const edited = await service.rate(resA, first.ownerId, { rating: 3 });
    expect('misma fila al editar', edited.id, created.id);
    expect('el comentario se quita al editar sin comentario', edited.comment, null);
    expect('conteo tras editar', (await runner.query('SELECT count(*)::int AS n FROM tenant_rating WHERE "reservationId" = $1', [resA]))[0].n, 1);

    // Reglas de acceso.
    await code('calificar la reserva de otro propietario', service.rate(resA, second.ownerId, { rating: 1 }), 'API_SOLO_EL_PROPIETARIO_PUEDE_CALIFICAR_A_SU_INQUILINO');
    await code('reserva inexistente', service.rate(2147483000, first.ownerId, { rating: 4 }), 'API_RESERVA_NO_ENCONTRADA');

    await service.rate(resB, second.ownerId, { rating: 5, comment: 'Muy recomendado' });

    // Lo que ve el propietario A: el puntaje de todos y sus propias reservas con el inquilino.
    const seenByA = await service.forTenant(tenant.id, ownerA);
    expect('promedio de dos calificaciones (3 y 5)', [seenByA.summary.average, seenByA.summary.count], [4, 2]);
    expect('cuáles son suyas', seenByA.ratings.map((row) => row.mine).sort(), [false, true]);
    expect('solo el nombre del otro propietario', Object.keys(seenByA.ratings[0].owner), ['name']);
    expect('sus reservas con el inquilino', seenByA.myReservations.map((row) => (row as { reservationId: number }).reservationId), [resA]);
    expect('su calificación en esa reserva', (seenByA.myReservations[0] as { myRating: { rating: number } }).myRating.rating, 3);
    expect('distintivo', await service.summary(tenant.id, ownerB), { tenantId: tenant.id, average: 4, count: 2 });

    // El inquilino ve las suyas; otro inquilino no; quien no es inquilino no existe para el público.
    const own = await service.forTenant(tenant.id, { id: tenant.id, roles: ['CLIENT'] });
    expect('el inquilino ve sus calificaciones', own.summary.count, 2);
    expect('y no tiene controles de reserva', own.myReservations, []);
    await code('otro inquilino', service.forTenant(tenant.id, { id: tenant.id + 1, roles: ['CLIENT'] }), 'API_NO_PUEDES_CONSULTAR_LOS_DATOS_DE_OTRO_USUARIO');
    // Quien no tiene rol de inquilino (o no existe) no se puede consultar por su id.
    const [notTenant]: { id: number }[] = await runner.query(
      `SELECT id FROM "user" u WHERE NOT EXISTS (SELECT 1 FROM user_role ur JOIN role r ON r.id = ur."roleId" WHERE ur."userId" = u.id AND r.name = 'CLIENT') LIMIT 1`,
    );
    if (notTenant) await code('usuario sin rol de inquilino', service.forTenant(notTenant.id, ownerB), 'API_INQUILINO_NO_ENCONTRADO');
    await code('usuario inexistente', service.forTenant(2147483000, ownerB), 'API_INQUILINO_NO_ENCONTRADO');

    // La base también protege los datos.
    await sqlFails('puntaje fuera de 1 a 5', runner, 'UPDATE tenant_rating SET rating = 6 WHERE "reservationId" = $1', [resA]);
    await sqlFails('dos calificaciones para la misma reserva', runner,
      'INSERT INTO tenant_rating ("reservationId", "tenantId", "ownerId", rating) VALUES ($1, $2, $3, 4)', [resA, tenant.id, first.ownerId]);

    console.log('OK: calificaciones de inquilinos (promedio, edición, permisos y restricciones de la base)');
  } finally {
    await runner.rollbackTransaction();
    await runner.release();
    await source.destroy();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
