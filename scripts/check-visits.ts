// Prueba real de las citas contra PostgreSQL. Todo ocurre dentro de una transacción que se revierte.
import { ConfigModule } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { ReservationService } from '../src/reservation/reservation.service';
import { VisitService } from '../src/visit/visit.service';
import { addDays, DEFAULT_TIMEZONE, localParts, zonedTimeToUtc } from '../src/visit/visit-slots';

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
    const manager = runner.manager;
    // La base es compartida y puede tener citas reales: la prueba parte de cero dentro de su transacción (que se revierte).
    await runner.query('DELETE FROM visit');
    const fake = {
      transaction: (work: (m: typeof manager) => unknown) => work(manager),
      getRepository: (entity: never) => manager.getRepository(entity),
      createQueryBuilder: () => manager.createQueryBuilder(),
      query: (sql: string, params?: unknown[]) => runner.query(sql, params),
    } as unknown as DataSource;
    const visits = new VisitService(fake);
    const reservations = new ReservationService(fake);

    // --- Datos reales: una propiedad activa, su propietario y tres inquilinos distintos ---
    const properties: { id: number; ownerId: number }[] = await runner.query(`SELECT id, "ownerId" FROM property WHERE status = 'ACTIVE' ORDER BY id LIMIT 1`);
    if (!properties.length) throw new Error('Se necesita al menos una propiedad ACTIVE para la prueba');
    const { id: propertyId, ownerId } = properties[0];
    await runner.query(`UPDATE property SET "reservedTenantId" = NULL, "reservedTenantName" = NULL, "reservedAt" = NULL WHERE id = $1`, [propertyId]);
    await runner.query(`DELETE FROM visit WHERE "propertyId" = $1`, [propertyId]);
    await runner.query(`DELETE FROM property_availability WHERE "propertyId" = $1`, [propertyId]);
    const users: { id: number }[] = await runner.query(`SELECT id FROM "user" WHERE "isActive" = true AND id <> $1 ORDER BY id LIMIT 3`, [ownerId]);
    if (users.length < 2) throw new Error('Se necesitan al menos 2 usuarios activos además del propietario');
    const [t1, t2] = [users[0].id, users[1].id];
    const t3 = users[2]?.id ?? t1;

    const tz = DEFAULT_TIMEZONE;
    const now = new Date();
    // Un martes dentro de ~3 semanas, a las 10:00 y 10:30 locales (horario por defecto: lunes a sábado de 9 a 17).
    let day = addDays(localParts(now, tz).date, 21);
    while (localParts(zonedTimeToUtc(day, '10:00', tz), tz).weekday !== 2) day = addDays(day, 1);
    const at = (time: string) => zonedTimeToUtc(day, time, tz);
    const iso = (time: string) => at(time).toISOString();

    console.log(`Propiedad ${propertyId} · propietario ${ownerId} · inquilinos ${t1}, ${t2} · día de prueba ${day}`);

    // --- Calendario ---
    const calendar = await visits.slots(propertyId, { from: day, to: day }, now);
    expect('zona horaria por defecto', calendar.timezone, tz);
    expect('16 horarios en un día de atención', calendar.slots.length, 16);
    expect('el horario de las 10:00 está libre', calendar.slots.find((slot) => slot.localTime === '10:00')?.available, true);
    await code('rango invertido', visits.slots(propertyId, { from: day, to: addDays(day, -2) }, now), 'API_RANGO_DE_FECHAS_INVALIDO');
    await code('fecha inexistente', visits.slots(propertyId, { from: '2026-02-30', to: '2026-03-01' }, now), 'API_RANGO_DE_FECHAS_INVALIDO');

    // --- El primero retiene el horario ---
    const first = await visits.request(t1, { propertyId, scheduledAt: iso('10:00'), note: ' Llego con mi pareja ' }, now);
    expect('solicitud pendiente', [first.status, first.note, first.timezone], ['PENDING', 'Llego con mi pareja', tz]);
    expect('vence a las 48 h', Math.round((new Date(first.expiresAt!).getTime() - now.getTime()) / 3_600_000), 48);
    const afterFirst = await visits.slots(propertyId, { from: day, to: day }, now);
    expect('el horario queda retenido', afterFirst.slots.find((slot) => slot.localTime === '10:00')?.available, false);
    await code('el segundo no puede pedir el mismo horario', visits.request(t2, { propertyId, scheduledAt: iso('10:00') }, now), 'API_HORARIO_NO_DISPONIBLE');
    await code('una persona, una cita activa por propiedad', visits.request(t1, { propertyId, scheduledAt: iso('11:00') }, now), 'API_YA_TIENES_UNA_CITA_ACTIVA_EN_ESTA_PROPIEDAD');
    await code('horario fuera de la atención', visits.request(t2, { propertyId, scheduledAt: zonedTimeToUtc(day, '22:00', tz).toISOString() }, now), 'API_HORARIO_NO_VALIDO');
    await code('horario que no es del calendario', visits.request(t2, { propertyId, scheduledAt: new Date(at('10:30').getTime() + 60_000).toISOString() }, now), 'API_HORARIO_NO_VALIDO');
    await code('horario demasiado próximo', visits.request(t2, { propertyId, scheduledAt: new Date(now.getTime() + 20 * 60_000).toISOString() }, now), 'API_HORARIO_DEMASIADO_PROXIMO');
    await code('propiedad propia', visits.request(ownerId, { propertyId, scheduledAt: iso('11:00') }, now), 'API_NO_PUEDES_AGENDAR_UNA_CITA_EN_TU_PROPIEDAD');

    const second = await visits.request(t2, { propertyId, scheduledAt: iso('10:30') }, now);
    // La transacción de prueba es una sola: se separan las horas de solicitud para comprobar el orden.
    await runner.query(`UPDATE visit SET "createdAt" = $1 WHERE id = $2`, [new Date(now.getTime() - 120_000), first.id]);
    await runner.query(`UPDATE visit SET "createdAt" = $1 WHERE id = $2`, [new Date(now.getTime() - 60_000), second.id]);

    const queue = await visits.listReceived(ownerId, now);
    expect('el propietario ve primero a quien pidió primero', queue.slice(0, 2).map((visit) => visit.id), [first.id, second.id]);
    expect('el inquilino ve solo lo suyo', (await visits.listMine(t2, now)).map((visit) => visit.id), [second.id]);
    expect('contador de pendientes del propietario', (await visits.summary(ownerId, now)).ownerPending, 2);

    // --- Respuestas ---
    expect('confirmar', (await visits.confirm(first.id, ownerId, now)).status, 'CONFIRMED');
    await code('confirmar dos veces', visits.confirm(first.id, ownerId, now), 'API_EL_ESTADO_DE_LA_CITA_NO_PERMITE_ESTA_ACCION');
    await code('otro propietario no gestiona', visits.confirm(second.id, t1, now), 'API_SOLO_EL_PROPIETARIO_PUEDE_GESTIONAR_LA_CITA');

    const proposed = await visits.propose(second.id, ownerId, iso('11:00'), now);
    expect('contrapropuesta', [proposed.status, proposed.scheduledAt, proposed.previousScheduledAt], ['COUNTER_PROPOSED', iso('11:00'), iso('10:30')]);
    const afterPropose = await visits.slots(propertyId, { from: day, to: day }, now);
    expect('se libera el horario original y se retiene el nuevo', [
      afterPropose.slots.find((slot) => slot.localTime === '10:30')?.available, afterPropose.slots.find((slot) => slot.localTime === '11:00')?.available,
    ], [true, false]);
    await code('el propietario no puede aceptar su propia propuesta', visits.accept(second.id, t1, now), 'API_SOLO_EL_INQUILINO_PUEDE_RESPONDER_LA_CONTRAPROPUESTA');
    expect('el inquilino acepta', (await visits.accept(second.id, t2, now)).status, 'CONFIRMED');

    const cancelled = await visits.cancel(second.id, t2, 'Ya no me sirve', now);
    expect('cancelar libera el horario', [cancelled.status, cancelled.cancelledBy, cancelled.cancelReason], ['CANCELLED', 'TENANT', 'Ya no me sirve']);
    expect('horario libre otra vez', (await visits.slots(propertyId, { from: day, to: day }, now)).slots.find((slot) => slot.localTime === '11:00')?.available, true);

    // --- Vencimiento: nadie respondió a tiempo ---
    const stale = await visits.request(t2, { propertyId, scheduledAt: iso('12:00') }, now);
    await runner.query(`UPDATE visit SET "expiresAt" = $1 WHERE id = $2`, [new Date(now.getTime() - 1000), stale.id]);
    expect('se muestra como vencida', (await visits.listMine(t2, now)).find((visit) => visit.id === stale.id)?.status, 'EXPIRED');
    expect('el horario vencido vuelve a estar libre', (await visits.slots(propertyId, { from: day, to: day }, now)).slots.find((slot) => slot.localTime === '12:00')?.available, true);
    await code('no se puede confirmar una vencida', visits.confirm(stale.id, ownerId, now), 'API_LA_SOLICITUD_YA_VENCIO');
    const retaken = await visits.request(t2, { propertyId, scheduledAt: iso('12:00') }, now);
    expect('otra persona puede tomar el horario vencido', retaken.status, 'PENDING');
    await visits.cancel(retaken.id, t2, undefined, now);

    // --- Tope de solicitudes pendientes ---
    for (const [index, time] of ['13:00', '13:30', '14:00', '14:30', '15:00'].entries()) {
      await runner.query(
        `INSERT INTO visit ("propertyId", "tenantId", "ownerId", "scheduledAt", status, timezone, "expiresAt") VALUES ($1, $2, $3, $4, 'PENDING', $5, $6)`,
        [propertyId, index % 2 ? t1 : t3, ownerId, at(time), tz, new Date(now.getTime() + 3_600_000)],
      );
    }
    await code('el propietario no queda desbordado', visits.request(t2, { propertyId, scheduledAt: iso('16:00') }, now), 'API_EL_PROPIETARIO_TIENE_DEMASIADAS_SOLICITUDES');
    await runner.query(`DELETE FROM visit WHERE "propertyId" = $1 AND status = 'PENDING'`, [propertyId]);

    // --- Los índices únicos protegen aunque dos personas lleguen a la vez ---
    await runner.query('SAVEPOINT duplicate_slot');
    let violated = '';
    try {
      await runner.query(
        `INSERT INTO visit ("propertyId", "tenantId", "ownerId", "scheduledAt", status, timezone) VALUES ($1, $2, $3, $4, 'PENDING', $5)`,
        [propertyId, t2, ownerId, at('10:00'), tz],
      );
    } catch (error) {
      violated = (error as { constraint?: string }).constraint ?? '';
    }
    await runner.query('ROLLBACK TO SAVEPOINT duplicate_slot');
    expect('índice único del horario', violated, 'uq_visit_active_slot');

    // --- Reservar desde la cita ---
    const confirmed = (await visits.listMine(t1, now)).find((visit) => visit.status === 'CONFIRMED')!;
    await code('solo el propietario reserva', reservations.reserveFromVisit(confirmed.id, t1), 'API_SOLO_EL_PROPIETARIO_PUEDE_ALQUILAR_ESTA_PROPIEDAD');
    const reserved = await reservations.reserveFromVisit(confirmed.id, ownerId);
    expect('reservada para quien tenía la cita', reserved.reservedTenantId, t1);
    expect('la cita lo refleja', (await visits.loadView(confirmed.id, now)).property.reservedForTenant, true);
    await code('con la propiedad reservada nadie más agenda', visits.request(t2, { propertyId, scheduledAt: iso('16:00') }, now), 'API_LA_PROPIEDAD_YA_ESTA_RESERVADA');
    const cancelledVisit = (await visits.loadView(cancelled.id, now));
    await code('una cita cancelada no sirve para reservar', reservations.reserveFromVisit(cancelledVisit.id, ownerId), 'API_LA_CITA_DEBE_ESTAR_CONFIRMADA_PARA_RESERVAR');

    // --- Disponibilidad del propietario ---
    await runner.query(`UPDATE property SET "reservedTenantId" = NULL, "reservedTenantName" = NULL, "reservedAt" = NULL WHERE id = $1`, [propertyId]);
    await code('zona horaria inválida', visits.setAvailability(propertyId, ownerId, { timezone: 'Mars/Olympus', rules: [] }), 'API_ZONA_HORARIA_INVALIDA');
    await code('ventana al revés', visits.setAvailability(propertyId, ownerId, { timezone: tz, rules: [{ weekday: 2, start: '15:00', end: '10:00' }] }), 'API_DISPONIBILIDAD_INVALIDA');
    await code('ventanas solapadas', visits.setAvailability(propertyId, ownerId, { timezone: tz, rules: [{ weekday: 2, start: '10:00', end: '12:00' }, { weekday: 2, start: '11:00', end: '13:00' }] }), 'API_DISPONIBILIDAD_INVALIDA');
    await code('solo el propietario configura', visits.setAvailability(propertyId, t1, { timezone: tz, rules: [] }), 'API_SOLO_EL_PROPIETARIO_PUEDE_CONFIGURAR_LA_DISPONIBILIDAD');
    expect('antes de configurar se usa el horario por defecto', (await visits.getAvailability(propertyId, ownerId)).isDefault, true);
    await visits.setAvailability(propertyId, ownerId, { timezone: tz, rules: [{ weekday: 2, start: '14:00', end: '16:00' }] });
    const custom = await visits.slots(propertyId, { from: day, to: day }, now);
    expect('solo los martes de 14:00 a 16:00', custom.slots.map((slot) => slot.localTime), ['14:00', '14:30', '15:00', '15:30']);
    expect('configuración guardada', (await visits.getAvailability(propertyId, ownerId)).isDefault, false);

    console.log('Citas verificadas en PostgreSQL (retención, orden, respuestas, vencimiento, tope, índices y reserva). Se revierte toda la prueba.');
  } finally {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await runner.release();
    await source.destroy();
  }
}
void main().catch((error: Error) => { console.error(error.message); process.exitCode = 1; });
