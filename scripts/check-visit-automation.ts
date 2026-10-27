// Prueba real de la automatización de citas (vencimiento, cancelación al reservar, recordatorios, confirmación
// automática y chat del propietario) contra PostgreSQL. Todo ocurre en una transacción que se revierte y el correo es falso.
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { ConversationService } from '../src/messages/conversation/conversation.service';
import { Conversation } from '../src/messages/conversation/entities/conversation.entity';
import { Message } from '../src/messages/message/entities/message.entity';
import type { BrevoMailService, NotificationContent } from '../src/mail/brevo-mail.service';
import { Property } from '../src/property/entities/property.entity';
import { ReservationService } from '../src/reservation/reservation.service';
import { User } from '../src/user/entities/user.entity';
import { VisitJobsService } from '../src/visit/visit-jobs.service';
import { VisitNotificationService } from '../src/visit/visit-notification.service';
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
    expect(label, (error as { response?: { code?: string } }).response?.code ?? (error as Error).message, expected);
    return;
  }
  throw new Error(`${label}: se esperaba el error ${expected} y no falló`);
}

interface Sent { to: string; language: string; content: NotificationContent }

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
    for (const [table, column] of [['visit', 'reminderSentAt'], ['property_availability', 'autoConfirm']]) {
      if (!(await runner.hasColumn(table, column))) throw new Error(`Falta la columna ${table}.${column} (reinicia el backend o aplica docs/visit-schema.sql)`);
    }
    const fake = {
      transaction: (work: (m: typeof manager) => unknown) => work(manager),
      getRepository: (entity: never) => manager.getRepository(entity),
      createQueryBuilder: () => manager.createQueryBuilder(),
      query: (sql: string, params?: unknown[]) => runner.query(sql, params),
    } as unknown as DataSource;

    const sent: Sent[] = [];
    const mail = { sendNotification: async (to: string, language: string, content: NotificationContent) => { sent.push({ to, language, content }); } } as unknown as BrevoMailService;
    const notifier = new VisitNotificationService(fake, mail, new ConfigService({}));
    const visits = new VisitService(fake, notifier);
    const reservations = new ReservationService(fake, visits, notifier);
    const jobs = new VisitJobsService(fake, notifier);
    const conversations = new ConversationService(manager.getRepository(Conversation), manager.getRepository(User), manager.getRepository(Property), manager.getRepository(Message));

    const settle = async (count: number) => {
      for (let attempt = 0; attempt < 60 && sent.length < count; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 100));
      await new Promise((resolve) => setTimeout(resolve, 400));
      expect('correos enviados', sent.length, count);
    };

    // --- Datos reales ---
    const properties: { id: number; ownerId: number }[] = await runner.query(`SELECT id, "ownerId" FROM property WHERE status = 'ACTIVE' ORDER BY id LIMIT 1`);
    if (!properties.length) throw new Error('Se necesita al menos una propiedad ACTIVE para la prueba');
    const { id: propertyId, ownerId } = properties[0];
    await runner.query(`UPDATE property SET "reservedTenantId" = NULL, "reservedTenantName" = NULL, "reservedAt" = NULL WHERE id = $1`, [propertyId]);
    await runner.query(`DELETE FROM visit WHERE "ownerId" = $1`, [ownerId]);
    await runner.query(`DELETE FROM property_availability WHERE "propertyId" = $1`, [propertyId]);
    const users: { id: number }[] = await runner.query(`SELECT id FROM "user" WHERE "isActive" = true AND id <> $1 AND email IS NOT NULL ORDER BY id LIMIT 3`, [ownerId]);
    if (users.length < 2) throw new Error('Se necesitan al menos 2 usuarios activos con correo además del propietario');
    const [t1, t2] = users.map((user) => user.id);
    await runner.query(`UPDATE "user" SET "preferredLanguage" = 'fr' WHERE id = $1`, [ownerId]);
    await runner.query(`UPDATE "user" SET "preferredLanguage" = 'en' WHERE id = $1`, [t1]);
    await runner.query(`UPDATE "user" SET "preferredLanguage" = NULL WHERE id = $1`, [t2]);

    const tz = DEFAULT_TIMEZONE;
    const now = new Date();
    let day = addDays(localParts(now, tz).date, 21);
    while (localParts(zonedTimeToUtc(day, '10:00', tz), tz).weekday !== 2) day = addDays(day, 1);
    const iso = (time: string) => zonedTimeToUtc(day, time, tz).toISOString();
    const statusOf = async (id: number): Promise<string> => (await runner.query(`SELECT status FROM visit WHERE id = $1`, [id]))[0].status;

    // --- 1. Vencimiento: se libera el horario y se avisa a quien quedó esperando ---
    const stale = await visits.request(t1, { propertyId, scheduledAt: iso('10:00') }, now);
    sent.length = 0;
    expect('antes del plazo no vence nada', await jobs.expireStale(now), 0);
    await runner.query(`UPDATE visit SET "expiresAt" = $1 WHERE id = $2`, [new Date(now.getTime() - 1000), stale.id]);
    expect('vence 1 solicitud', await jobs.expireStale(now), 1);
    expect('queda como vencida', await statusOf(stale.id), 'EXPIRED');
    expect('el inquilino se entera (en inglés)', [sent[0].language, sent[0].content.title], ['en', 'The request expired without a reply']);
    expect('no se repite', await jobs.expireStale(now), 0);
    expect('el horario quedó libre', (await visits.slots(propertyId, { from: day, to: day }, now)).slots.find((slot) => slot.localTime === '10:00')?.available, true);

    const proposal = await visits.request(t1, { propertyId, scheduledAt: iso('10:30') }, now);
    await visits.propose(proposal.id, ownerId, iso('11:00'), now);
    sent.length = 0;
    await runner.query(`UPDATE visit SET "expiresAt" = $1 WHERE id = $2`, [new Date(now.getTime() - 1000), proposal.id]);
    expect('vence una propuesta sin respuesta', await jobs.expireStale(now), 1);
    expect('avisa al propietario, en francés', [sent[0].language, sent[0].content.title], ['fr', 'La proposition a expiré']);

    // También se avisa cuando el vencimiento se descubre al pedir un horario.
    const lazy = await visits.request(t1, { propertyId, scheduledAt: iso('12:00') }, now);
    await runner.query(`UPDATE visit SET "expiresAt" = $1 WHERE id = $2`, [new Date(now.getTime() - 1000), lazy.id]);
    sent.length = 0;
    const reuse = await visits.request(t2, { propertyId, scheduledAt: iso('12:00') }, now);
    await settle(2); // el aviso de la que venció + el de la solicitud nueva al propietario
    expect('otra persona toma el horario vencido', reuse.status, 'PENDING');
    expect('y se avisa de la que venció', sent.some((email) => email.content.title === 'The request expired without a reply'), true);
    expect('y de la solicitud nueva', sent.some((email) => email.content.title === 'Vous avez une nouvelle demande de visite'), true);
    await visits.cancel(reuse.id, t2, undefined, now);

    // --- 2. Recordatorio 24 h antes, una sola vez, a las dos personas ---
    const insertConfirmed = async (tenantId: number, startsInHours: number, confirmedHoursAgo: number) => {
      const [row] = await runner.query(
        `INSERT INTO visit ("propertyId", "tenantId", "ownerId", "scheduledAt", status, timezone, "confirmedAt") VALUES ($1, $2, $3, $4, 'CONFIRMED', $5, $6) RETURNING id`,
        [propertyId, tenantId, ownerId, new Date(now.getTime() + startsInHours * 3_600_000), tz, new Date(now.getTime() - confirmedHoursAgo * 3_600_000)],
      );
      return row.id as number;
    };
    await runner.query(`DELETE FROM visit WHERE "ownerId" = $1`, [ownerId]);
    sent.length = 0;
    const soon = await insertConfirmed(t1, 20, 10); // en 20 h, confirmada hace 10 h: sí
    await insertConfirmed(t2, 30, 10);             // en 30 h: todavía no
    expect('solo se recuerda la que ocurre en las próximas 24 h', await jobs.sendReminders(now), 1);
    expect('llegan dos correos: inquilino y propietario', sent.map((email) => email.content.title), ['Your visit is coming up', 'Vous avez une visite bientôt']);
    expect('queda marcada', (await runner.query(`SELECT "reminderSentAt" FROM visit WHERE id = $1`, [soon]))[0].reminderSentAt !== null, true);
    expect('no se repite', await jobs.sendReminders(now), 0);
    await runner.query(`DELETE FROM visit WHERE "ownerId" = $1`, [ownerId]);
    await insertConfirmed(t1, 10, 1); // confirmada hace 1 h: el correo de confirmación ya es el aviso
    expect('una cita recién confirmada no se recuerda', await jobs.sendReminders(now), 0);
    await runner.query(`DELETE FROM visit WHERE "ownerId" = $1`, [ownerId]);

    // --- 3. Al reservar la propiedad se cancelan las demás citas ---
    const winner = await visits.request(t1, { propertyId, scheduledAt: iso('13:00') }, now);
    await visits.confirm(winner.id, ownerId, now);
    const loser = await visits.request(t2, { propertyId, scheduledAt: iso('13:30') }, now);
    await settle(sent.length); // deja salir los correos de arriba
    sent.length = 0;
    const reserved = await reservations.reserveFromVisit(winner.id, ownerId);
    await settle(1);
    expect('reservada para quien tenía la cita', reserved.reservedTenantId, t1);
    expect('la cita confirmada de quien reservó sigue', await statusOf(winner.id), 'CONFIRMED');
    expect('la de la otra persona se canceló sola', await statusOf(loser.id), 'CANCELLED');
    const auto = (await runner.query(`SELECT "cancelledBy", "cancelReason" FROM visit WHERE id = $1`, [loser.id]))[0];
    expect('cancelada por el sistema', [auto.cancelledBy, auto.cancelReason], ['SYSTEM', 'PROPERTY_RESERVED']);
    expect('se le avisa a esa persona, sin nombrar a nadie', [sent[0].content.title, sent[0].content.button.path], ['La propiedad fue reservada', '/explorar']);
    expect('el horario cancelado queda libre en el calendario', (await visits.slots(propertyId, { from: day, to: day }, now)).propertyReserved, true);
    await runner.query(`UPDATE property SET "reservedTenantId" = NULL, "reservedTenantName" = NULL, "reservedAt" = NULL WHERE id = $1`, [propertyId]);
    await runner.query(`DELETE FROM visit WHERE "ownerId" = $1`, [ownerId]);
    sent.length = 0;

    // --- 4. Confirmación automática ---
    const saved = await visits.setAvailability(propertyId, ownerId, { timezone: tz, rules: [{ weekday: 2, start: '09:00', end: '17:00' }], autoConfirm: true });
    expect('queda activada', saved.autoConfirm, true);
    expect('el calendario lo informa', (await visits.slots(propertyId, { from: day, to: day }, now)).autoConfirm, true);
    const instant = await visits.request(t1, { propertyId, scheduledAt: iso('09:00') }, now);
    await settle(2);
    expect('la cita queda confirmada al instante', [instant.status, instant.expiresAt], ['CONFIRMED', null]);
    expect('avisa al propietario y al inquilino', sent.map((email) => email.content.title).sort(), ['Une visite a été confirmée automatiquement', 'Your visit was confirmed']);
    expect('no cuenta como solicitud por responder', (await visits.summary(ownerId, now)).ownerPending, 0);
    await code('el mismo horario ya no está libre', visits.request(t2, { propertyId, scheduledAt: iso('09:00') }, now), 'API_HORARIO_NO_DISPONIBLE');

    // Lo que el propietario ya tiene confirmado en otra propiedad suya también cuenta como ocupado.
    const columns: { column_name: string }[] = await runner.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'property' AND column_name <> 'id'`,
    );
    const list = columns.map((column) => `"${column.column_name}"`).join(', ');
    const [copy] = await runner.query(`INSERT INTO property (${list}) SELECT ${list} FROM property WHERE id = $1 RETURNING id`, [propertyId]);
    await runner.query(`UPDATE property SET status = 'ACTIVE' WHERE id = $1`, [copy.id]);
    await runner.query(`INSERT INTO property_availability ("propertyId", timezone, rules) VALUES ($1, $2, $3)`, [copy.id, tz, JSON.stringify([{ weekday: 2, start: '09:00', end: '17:00' }])]);
    const other = await visits.slots(copy.id, { from: day, to: day }, now);
    expect('en la otra propiedad del mismo propietario el horario no está libre', other.slots.find((slot) => slot.localTime === '09:00')?.available, false);
    expect('pero sí el siguiente', other.slots.find((slot) => slot.localTime === '09:30')?.available, true);
    await code('pedirlo igual se rechaza', visits.request(t2, { propertyId: copy.id, scheduledAt: iso('09:00') }, now), 'API_HORARIO_NO_DISPONIBLE');

    // --- 5. El propietario también puede abrir el chat de una cita confirmada ---
    await runner.query(`DELETE FROM message WHERE "conversationId" IN (SELECT id FROM conversation WHERE "propertyId" = $1)`, [propertyId]);
    const ownerChat = await conversations.createFromVisit(instant.id, ownerId);
    const tenantChat = await conversations.createFromVisit(instant.id, t1);
    expect('es la misma conversación para los dos', ownerChat.id, tenantChat.id);
    expect('con el propietario y el inquilino', (ownerChat.participants ?? []).map((user: { id: number }) => user.id).sort(), [ownerId, t1].sort());
    await code('quien no participa no la abre', conversations.createFromVisit(instant.id, t2), 'API_NO_PARTICIPAS_EN_ESTA_CITA');
    const pending = await visits.request(t2, { propertyId, scheduledAt: iso('10:00') }, now);
    expect('(con la confirmación automática también queda confirmada)', pending.status, 'CONFIRMED');
    await visits.setAvailability(propertyId, ownerId, { timezone: tz, rules: [{ weekday: 2, start: '09:00', end: '17:00' }], autoConfirm: false });
    const manual = await visits.request(t1 === t2 ? t1 : (users[2]?.id ?? t1), { propertyId, scheduledAt: iso('11:00') }, now).catch(() => null);
    if (manual) await code('una cita sin confirmar no abre chat', conversations.createFromVisit(manual.id, ownerId), 'API_EL_ESTADO_DE_LA_CITA_NO_PERMITE_ESTA_ACCION');

    console.log('Automatización de citas verificada en PostgreSQL (vencimiento, recordatorios, cancelar al reservar, confirmación automática y chat del propietario). Se revierte toda la prueba y no se envió ningún correo real.');
  } finally {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await runner.release();
    await source.destroy();
  }
}
void main().catch((error: Error) => { console.error(error.message); process.exitCode = 1; });
