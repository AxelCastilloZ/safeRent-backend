const fs = require('node:fs');
const assert = require('node:assert/strict');
require('node:dns').setDefaultResultOrder('ipv4first');
const { DataSource } = require('typeorm');
const {
  ProfileCurrency1792454400002,
} = require('../dist/src/migrations/1792454400002-profile-currency');
const env = {
  ...require('dotenv').parse(fs.readFileSync('.env')),
  ...process.env,
};
const db = new DataSource({
  type: 'postgres',
  host: env.DB_HOST,
  port: Number(env.DB_PORT),
  username: env.DB_USERNAME,
  password: env.DB_PASSWORD,
  database: env.DB_DATABASE,
  synchronize: false,
  migrationsRun: false,
  logging: false,
  extra: { connectionTimeoutMillis: 10000 },
});
(async () => {
  let runner;
  try {
    await db.initialize();
    runner = db.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    // The temporary table shadows public.user only on this transaction's connection.
    await runner.query(
      'CREATE TEMP TABLE "user" (id integer PRIMARY KEY) ON COMMIT DROP',
    );
    await runner.query('INSERT INTO "user" (id) VALUES (1)');
    const migration = new ProfileCurrency1792454400002();
    await migration.up(runner);
    await migration.up(runner);
    assert.deepEqual(
      (
        await runner.query(
          'SELECT "countryCode", "preferredCurrency" FROM "user"',
        )
      )[0],
      { countryCode: null, preferredCurrency: null },
    );
    await runner.query(
      'UPDATE "user" SET "countryCode" = $1, "preferredCurrency" = $2',
      ['CR', 'USD'],
    );
    assert.equal(
      (await runner.query('SELECT "preferredCurrency" FROM "user"'))[0]
        .preferredCurrency,
      'USD',
    );
    await migration.down(runner);
    const columns = await runner.query(
      `SELECT attname FROM pg_attribute WHERE attrelid = '"user"'::regclass AND attnum > 0 AND NOT attisdropped`,
    );
    assert.deepEqual(
      columns.map((row) => row.attname),
      ['id'],
    );
    await migration.up(runner);
    console.log(
      'PostgreSQL: migración de perfil up/down e idempotencia correctas; fila existente conserva su identidad y recibe preferencias nulas.',
    );
  } catch (error) {
    console.error(
      'Verificación de migración falló: ' +
        (error.code || error.name || 'error'),
    );
    process.exitCode = 1;
  } finally {
    if (runner) {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      await runner.release();
    }
    if (db.isInitialized) await db.destroy();
    console.log(
      'Transacción revertida y tabla temporal eliminada; no se modificaron cuentas existentes.',
    );
  }
})();
