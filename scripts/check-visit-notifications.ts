// Prueba real de los avisos de citas contra PostgreSQL. Todo ocurre dentro de una transacción que se revierte
// y el correo es falso: solo se registra lo que se enviaría, no sale nada a nadie.
import { ConfigService } from '@nestjs/config';
import { ConfigModule } from '@nestjs/config';
import { DataSource } from 'typeorm';
import type { BrevoMailService, NotificationContent } from '../src/mail/brevo-mail.service';
import { VisitNotificationService } from '../src/visit/visit-notification.service';
import { VisitService } from '../src/visit/visit.service';
import { addDays, DEFAULT_TIMEZONE, localParts, zonedTimeToUtc } from '../src/visit/visit-slots';

void ConfigModule.forRoot();

function expect(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label}: se esperaba ${JSON.stringify(expected)} y llegó ${JSON.stringify(actual)}`);
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
    if (!(await runner.hasColumn('visit', 'ownerNotifiedAt'))) throw new Error('Falta la columna visit.ownerNotifiedAt (reinicia el backend o aplica docs/visit-schema.sql)');
    const fake = {
      transaction: (work: (m: typeof manager) => unknown) => work(manager),
      getRepository: (entity: never) => manager.getRepository(entity),
      createQueryBuilder: () => manager.createQueryBuilder(),
      query: (sql: string, params?: unknown[]) => runner.query(sql, params),
    } as unknown as DataSource;

    // Correo falso: guarda lo que se enviaría. `failing` simula que el proveedor no responde.
    const sent: Sent[] = [];
    let failing = false;
    const mail = {
      sendNotification: async (to: string, language: string, content: NotificationContent) => {
        if (failing) throw new Error('proveedor caído');
        sent.push({ to, language, content });
      },
    } as unknown as BrevoMailService;
    const config = new ConfigService({});
    const notifier = new VisitNotificationService(fake, mail, config);
    const visits = new VisitService(fake, notifier);

    // Los avisos salen sin esperar (no demoran la respuesta): se espera a que lleguen.
    const settle = async (count: number) => {
      for (let attempt = 0; attempt < 60 && sent.length < count; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 100));
      await new Promise((resolve) => setTimeout(resolve, 400)); // y un poco más, por si sale uno de más
      expect(`correos enviados`, sent.length, count);
    };

    // --- Datos reales ---
    const properties: { id: number; ownerId: number }[] = await runner.query(`SELECT id, "ownerId" FROM property WHERE status = 'ACTIVE' ORDER BY id LIMIT 1`);
    if (!properties.length) throw new Error('Se necesita al menos una propiedad ACTIVE para la prueba');
    const { id: propertyId, ownerId } = properties[0];
    await runner.query(`UPDATE property SET "reservedTenantId" = NULL, "reservedTenantName" = NULL, "reservedAt" = NULL WHERE id = $1`, [propertyId]);
    await runner.query(`DELETE FROM visit WHERE "ownerId" = $1`, [ownerId]);
    const users: { id: number; email: string | null }[] = await runner.query(`SELECT id, email FROM "user" WHERE "isActive" = true AND id <> $1 AND email IS NOT NULL ORDER BY id LIMIT 2`, [ownerId]);
    if (users.length < 2) throw new Error('Se necesitan al menos 2 usuarios activos con correo además del propietario');
    const [t1, t2] = users.map((user) => user.id);
    const owner: { email: string }[] = await runner.query(`SELECT email FROM "user" WHERE id = $1`, [ownerId]);
    // Cada persona recibe el correo en su idioma.
    await runner.query(`UPDATE "user" SET "preferredLanguage" = 'fr' WHERE id = $1`, [ownerId]);
    await runner.query(`UPDATE "user" SET "preferredLanguage" = 'en' WHERE id = $1`, [t1]);
    await runner.query(`UPDATE "user" SET "preferredLanguage" = NULL WHERE id = $1`, [t2]);

    const tz = DEFAULT_TIMEZONE;
    const now = new Date();
    let day = addDays(localParts(now, tz).date, 21);
    while (localParts(zonedTimeToUtc(day, '10:00', tz), tz).weekday !== 2) day = addDays(day, 1);
    const iso = (time: string) => zonedTimeToUtc(day, time, tz).toISOString();

    // --- 1. La primera solicitud se avisa de inmediato, en el idioma del propietario ---
    const first = await visits.request(t1, { propertyId, scheduledAt: iso('10:00') }, now);
    await settle(1);
    expect('va al propietario', sent[0].to, owner[0].email);
    expect('en su idioma', [sent[0].language, sent[0].content.subject.startsWith('Nouvelle demande de visite')], ['fr', true]);
    expect('con enlace a sus citas', sent[0].content.button.path, '/dashboard/owner/visits');
    const marked: { ownerNotifiedAt: Date | null }[] = await runner.query(`SELECT "ownerNotifiedAt" FROM visit WHERE id = $1`, [first.id]);
    expect('queda anotada la hora del aviso', marked[0].ownerNotifiedAt !== null, true);

    // --- 2. Mientras haya pendientes, las siguientes no mandan correo por separado ---
    const second = await visits.request(t2, { propertyId, scheduledAt: iso('10:30') }, now);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect('la segunda no genera correo', sent.length, 1);

    // --- 3. Resumen: no antes de 12 horas, una sola vez después ---
    expect('antes de 12 horas no hay resumen', await notifier.runDigest(now), 0);
    const later = new Date(now.getTime() + 13 * 3_600_000);
    await runner.query(`UPDATE visit SET "ownerNotifiedAt" = $1 WHERE "ownerId" = $2`, [new Date(now.getTime() - 13 * 3_600_000), ownerId]);
    await runner.query(`UPDATE visit SET "expiresAt" = $1 WHERE "ownerId" = $2 AND status = 'PENDING'`, [new Date(later.getTime() + 3_600_000), ownerId]);
    expect('después de 12 horas sale un resumen', await notifier.runDigest(later), 1);
    expect('el resumen cuenta las 2 solicitudes', sent[1].content.subject, 'Vous avez 2 demandes de visite en attente de réponse');
    expect('se nombra a la más antigua', sent[1].content.paragraphs[0].includes('{{') , false);
    expect('no se repite el mismo resumen', await notifier.runDigest(later), 0);
    sent.length = 1;

    // --- 4. Cada cambio avisa a la otra persona, en su idioma ---
    sent.length = 0;
    await visits.confirm(first.id, ownerId, now);
    await settle(1);
    expect('confirmar avisa al inquilino, en inglés', [sent[0].language, sent[0].content.subject.includes('was confirmed')], ['en', true]);

    await visits.propose(second.id, ownerId, iso('11:00'), now);
    await settle(2);
    expect('proponer otro horario avisa al inquilino, en español por defecto', [sent[1].language, sent[1].content.title], ['es', 'Te propusieron otro horario']);

    await visits.accept(second.id, t2, now);
    await settle(3);
    expect('aceptar avisa al propietario, en francés', [sent[2].to, sent[2].content.title], [owner[0].email, 'La visite est confirmée']);

    await visits.cancel(first.id, ownerId, 'Tuve un imprevisto', now);
    await settle(4);
    expect('cancelar (propietario) avisa al inquilino con el motivo', [sent[3].language, sent[3].content.paragraphs.at(-1)], ['en', 'Reason: Tuve un imprevisto']);

    await visits.cancel(second.id, t2, undefined, now);
    await settle(5);
    expect('cancelar (inquilino) avisa al propietario', [sent[4].to, sent[4].content.title], [owner[0].email, 'Une visite a été annulée']);

    // --- 5. Si el correo falla, la cita sigue su curso ---
    failing = true;
    const third = await visits.request(t1, { propertyId, scheduledAt: iso('12:00') }, now);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect('la solicitud se crea aunque el correo falle', third.status, 'PENDING');
    const confirmedWhileFailing = await visits.confirm(third.id, ownerId, now);
    expect('confirmar funciona aunque el correo falle', confirmedWhileFailing.status, 'CONFIRMED');
    failing = false;

    // --- 6. Cifras para los contadores ---
    const ownerSummary = await visits.summary(ownerId, now);
    expect('cifras del propietario', [ownerSummary.ownerPending, ownerSummary.ownerUpcoming], [0, 1]);
    const tenantSummary = await visits.summary(t1, now);
    expect('cifras del inquilino', [tenantSummary.tenantNeedsAnswer, tenantSummary.tenantUpcoming], [0, 1]);
    await visits.request(t2, { propertyId, scheduledAt: iso('13:00') }, now);
    await visits.propose((await visits.listReceived(ownerId, now)).find((visit) => visit.status === 'PENDING')!.id, ownerId, iso('13:30'), now);
    expect('una contrapropuesta espera respuesta del inquilino', (await visits.summary(t2, now)).tenantNeedsAnswer, 1);

    // --- 7. Se pueden apagar los correos ---
    const silent = new VisitNotificationService(fake, mail, new ConfigService({ VISIT_EMAILS_ENABLED: 'false' }));
    const before = sent.length;
    expect('con los correos apagados no se envía nada', [await silent.notify(first.id, 'CONFIRMED'), await silent.runDigest(later), sent.length], [false, 0, before]);

    console.log('Avisos de citas verificados en PostgreSQL (inmediato, resumen, cambios de estado, idiomas, fallos y contadores). Se revierte toda la prueba y no se envió ningún correo real.');
  } finally {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await runner.release();
    await source.destroy();
  }
}
void main().catch((error: Error) => { console.error(error.message); process.exitCode = 1; });
