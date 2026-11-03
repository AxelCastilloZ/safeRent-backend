// Prueba real de la encuesta de estadía y de los filtros del explorador contra PostgreSQL. Todo ocurre dentro de una transacción que se revierte.
import { ConfigModule } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { StaySurveys1793404800000 } from '../src/migrations/1793404800000-stay-surveys';
import { Property } from '../src/property/entities/property.entity';
import { applyStaySurveyFilters } from '../src/property/stay-survey-filters';
import { StaySurveyService } from '../src/stay-survey/stay-survey.service';

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
    await new StaySurveys1793404800000().up(runner);

    const properties: { id: number; ownerId: number }[] = await runner.query(
      `SELECT p.id, p."ownerId" FROM property p
       WHERE NOT EXISTS (SELECT 1 FROM reservation r WHERE r."propertyId" = p.id AND r."endedAt" IS NULL) ORDER BY p.id LIMIT 3`,
    );
    if (properties.length < 3) throw new Error('hacen falta tres propiedades sin reserva vigente para probar');
    const [propA, propB, propC] = properties;
    const tenants: { id: number }[] = await runner.query(
      `SELECT u.id FROM "user" u JOIN user_role ur ON ur."userId" = u.id JOIN role r ON r.id = ur."roleId"
       WHERE r.name = 'CLIENT' ORDER BY u.id DESC LIMIT 2`,
    );
    if (tenants.length < 2) throw new Error('hacen falta dos inquilinos para probar');
    const [tenant1, tenant2] = tenants;

    const reservation = async (property: { id: number; ownerId: number }, tenantId: number, ended: boolean) => (await runner.query(
      `INSERT INTO reservation ("startedAt", "endedAt", "propertyId", "tenantId", "ownerId")
       VALUES (now() - interval '40 days', ${ended ? "now() - interval '10 days'" : 'NULL'}, $1, $2, $3) RETURNING id`,
      [property.id, tenantId, property.ownerId],
    ) as { id: number }[])[0].id;
    const resA1 = await reservation(propA, tenant1.id, true);
    const resA2 = await reservation(propA, tenant2.id, true);
    const resB = await reservation(propB, tenant1.id, true);
    const resActive = await reservation(propC, tenant1.id, false);

    const manager = runner.manager;
    const fake = {
      getRepository: (entity: never) => manager.getRepository(entity),
      query: (sql: string, params?: unknown[]) => runner.query(sql, params),
    } as unknown as DataSource;
    const service = new StaySurveyService(fake);

    // Quién y cuándo puede responder.
    await code('reserva inexistente', service.submit(2147483000, tenant1.id, { waterStability: 3, electricityStability: 3, internetMbps: 10, hasWorkArea: false }), 'API_RESERVA_NO_ENCONTRADA');
    await code('reserva de otro inquilino', service.submit(resA1, tenant2.id, { waterStability: 3, electricityStability: 3, internetMbps: 10, hasWorkArea: false }), 'API_SOLO_EL_INQUILINO_PUEDE_RESPONDER_LA_ENCUESTA');
    await code('estadía aún vigente', service.submit(resActive, tenant1.id, { waterStability: 3, electricityStability: 3, internetMbps: 10, hasWorkArea: false }), 'API_LA_ESTADIA_AUN_NO_HA_TERMINADO');

    // Responder y corregir: sigue siendo una sola encuesta por reserva.
    const created = await service.submit(resA1, tenant1.id, { waterStability: 5, electricityStability: 4, internetMbps: 100, universityKm: 1.5, coworkingKm: 3, hasWorkArea: true });
    expect('km guardados como número', [created.universityKm, created.coworkingKm], [1.5, 3]);
    const edited = await service.submit(resA1, tenant1.id, { waterStability: 4, electricityStability: 4, internetMbps: 80, universityKm: 1.5, coworkingKm: null, hasWorkArea: true });
    expect('misma fila al corregir', edited.id, created.id);
    expect('distancia vacía se guarda como nula', edited.coworkingKm, null);
    expect('conteo tras corregir', (await runner.query('SELECT count(*)::int AS n FROM stay_survey WHERE "reservationId" = $1', [resA1]))[0].n, 1);

    await service.submit(resA2, tenant2.id, { waterStability: 2, electricityStability: 4, internetMbps: 20, universityKm: 2.5, hasWorkArea: false });
    await service.submit(resB, tenant1.id, { waterStability: 5, electricityStability: 5, internetMbps: 300, universityKm: 10, coworkingKm: 0.5, hasWorkArea: true });

    // Pendientes y respondidas del inquilino 1.
    const mine = await service.mine(tenant1.id);
    const mineIds = mine.map((row) => row.reservationId);
    expect('incluye sus estadías terminadas', [mineIds.includes(resA1), mineIds.includes(resB)], [true, true]);
    expect('la reserva vigente no cuenta', mineIds.includes(resActive), false);
    expect('las que respondió traen su encuesta', mine.filter((row) => [resA1, resB].includes(row.reservationId)).every((row) => row.survey !== null), true);

    // Promedios públicos de la propiedad A: agua (4+2)/2=3, luz 4, internet (80+20)/2=50, universidad (1.5+2.5)/2=2, coworking solo hay 1 dato → null, área de trabajo 1 de 2 no es mayoría.
    const summary = await service.summary(propA.id);
    expect('resumen de la propiedad A', [summary.count, summary.waterStability, summary.electricityStability, summary.internetMbps, summary.universityKm, summary.coworkingKm, summary.hasWorkArea],
      [2, 3, 4, 50, 2, null, false]);
    expect('propiedad sin encuestas', (await service.summary(propC.id)).count, 0);

    // Filtros del explorador sobre la consulta real.
    const idsWith = async (filters: Parameters<typeof applyStaySurveyFilters>[1]) => {
      const query = manager.getRepository(Property).createQueryBuilder('property').select('property.id', 'id').where('property.id IN (:...ids)', { ids: [propA.id, propB.id, propC.id] });
      applyStaySurveyFilters(query, filters);
      return ((await query.getRawMany()) as { id: number }[]).map((row) => row.id).sort((a, b) => a - b);
    };
    const all = [propA.id, propB.id, propC.id].sort((a, b) => a - b);
    expect('sin filtros del entorno no cambia nada', await idsWith({}), all);
    expect('agua 4 o más', await idsWith({ minWaterStability: 4 }), [propB.id]);
    expect('agua 3 o más', await idsWith({ minWaterStability: 3 }), [propA.id, propB.id].sort((a, b) => a - b));
    expect('internet de 100 Mbps o más', await idsWith({ minInternetMbps: 100 }), [propB.id]);
    expect('a menos de 3 km de la universidad', await idsWith({ maxUniversityKm: 3 }), [propA.id]);
    expect('a menos de 1 km de un coworking (sin dato no cumple)', await idsWith({ maxCoworkingKm: 1 }), [propB.id]);
    expect('con área de trabajo (mayoría)', await idsWith({ hasWorkArea: true }), [propB.id]);
    expect('combinados', await idsWith({ minWaterStability: 3, minInternetMbps: 100, hasWorkArea: true }), [propB.id]);
    expect('una propiedad sin encuestas no cumple ningún filtro', (await idsWith({ minWaterStability: 1 })).includes(propC.id), false);

    // La base también protege los datos.
    await sqlFails('agua fuera de 1 a 5', runner, 'UPDATE stay_survey SET "waterStability" = 6 WHERE "reservationId" = $1', [resA1]);
    await sqlFails('dos encuestas para la misma reserva', runner,
      'INSERT INTO stay_survey ("reservationId", "propertyId", "tenantId", "waterStability", "electricityStability", "internetMbps") VALUES ($1, $2, $3, 3, 3, 10)', [resA1, propA.id, tenant1.id]);

    console.log('OK: encuesta de estadía (permisos, corrección, promedios, filtros y restricciones de la base)');
  } finally {
    await runner.rollbackTransaction();
    await runner.release();
    await source.destroy();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
