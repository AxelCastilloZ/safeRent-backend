import { ConfigModule } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { ReservationService } from '../src/reservation/reservation.service';

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
    const rows: { id: number; propertyId: number; ownerId: number }[] = await runner.query(
      'SELECT c.id, c."propertyId", p."ownerId" FROM conversation c JOIN property p ON p.id=c."propertyId" WHERE p."reservedTenantId" IS NULL ORDER BY c.id LIMIT 1',
    );
    if (!rows.length) throw new Error('No hay una conversación disponible para verificar');
    const row = rows[0];
    await runner.query('UPDATE property SET status=$1 WHERE id=$2', ['ACTIVE', row.propertyId]);
    const service = new ReservationService({
      transaction: (work: (manager: typeof runner.manager) => unknown) => work(runner.manager),
    } as unknown as DataSource);
    const result = await service.reserve(row.id, row.ownerId);
    const saved: { reservedTenantId: number }[] = await runner.query('SELECT "reservedTenantId" FROM property WHERE id=$1', [row.propertyId]);
    if (!result.reservedTenantId || saved[0].reservedTenantId !== result.reservedTenantId) throw new Error('No se guardó la relación');
    const retry = await service.reserve(row.id, row.ownerId);
    if (retry.reservedAt?.getTime() !== result.reservedAt?.getTime()) throw new Error('El reintento cambió la fecha');
    console.log('Reserva y reintento verificados en PostgreSQL. Se revierte toda la prueba.');
  } finally {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await runner.release();
    await source.destroy();
  }
}
void main().catch((error: Error) => { console.error(error.message); process.exitCode = 1; });
