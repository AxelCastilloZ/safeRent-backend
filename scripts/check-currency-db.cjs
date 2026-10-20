// Real PostgreSQL checks in a temporary schema. No calls to CurrencyAPI.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
require('node:dns').setDefaultResultOrder('ipv4first');
const { DataSource } = require('typeorm');
const {
  CurrencyRates1792454400000,
} = require('../dist/src/migrations/1792454400000-currency-rates');
const {
  CurrencyProviderCodes1792454400001,
} = require('../dist/src/migrations/1792454400001-currency-provider-codes');
const {
  CurrencyRepository,
} = require('../dist/src/currency/currency.repository');
const {
  CurrencySyncService,
} = require('../dist/src/currency/currency-sync.service');
const { CurrencyService } = require('../dist/src/currency/currency.service');
const {
  CurrencySyncError,
  validateCurrencySnapshot,
} = require('../dist/src/currency/currency-api.client');

const env = {
  ...(fs.existsSync('.env')
    ? require('dotenv').parse(fs.readFileSync('.env'))
    : {}),
  ...process.env,
};
const options = {
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
};
const schema = 'currency_check_' + crypto.randomBytes(8).toString('hex');
const control = new DataSource(options);
const db = new DataSource({
  ...options,
  extra: { ...options.extra, options: '-c search_path=' + schema },
});

(async () => {
  let runner;
  let created = false;
  let stage = 'connection';
  try {
    await control.initialize();
    await control.query(`CREATE SCHEMA "${schema}"`);
    created = true;
    await db.initialize();
    runner = db.createQueryRunner();
    await runner.connect();
    stage = 'migration';
    const migration = new CurrencyRates1792454400000();
    const symbolsMigration = new CurrencyProviderCodes1792454400001();
    await runner.startTransaction();
    await migration.up(runner);
    await symbolsMigration.up(runner);
    await symbolsMigration.down(runner);
    await symbolsMigration.up(runner);
    await runner.commitTransaction();
    // A dev bootstrap followed by a production migration must be harmless.
    await migration.up(runner);
    await symbolsMigration.up(runner);
    const repository = new CurrencyRepository(db);
    let timestamp = Math.floor(Date.now() / 1000) - 3600;
    let calls = 0;
    let fail = false;
    let failureCode = 'CURRENCY_HTTP_429';
    const client = {
      fetchSnapshot: async () => {
        calls++;
        if (fail) throw new CurrencySyncError(failureCode);
        return validateCurrencySnapshot({
          valid: true,
          base: 'USD',
          updated: timestamp,
          rates: { CRC: 500, EUR: 0.92, DOGE: 5 },
        });
      },
    };
    const service = new CurrencySyncService(repository, client);
    const conversions = new CurrencyService(repository);
    const expireCooldown = () =>
      db.query(
        `UPDATE currency_sync_runs SET "startedAt" = now() - interval '2 minutes'`,
      );
    assert.deepEqual(await repository.getStatus(), {
      activeBatch: null,
      lastRun: null,
    });
    stage = 'first synchronization';
    const first = await service.synchronize();
    assert.equal(first.status, 'succeeded');
    let status = await repository.getStatus();
    assert.equal(status.activeBatch.currencyCount, 4);
    await assert.rejects(
      () => symbolsMigration.down(runner),
      /extended symbols/,
    );
    assert.equal(status.activeBatch.stale, false);
    assert.equal(
      (
        await db.query(
          'SELECT rate FROM exchange_rates WHERE "currencyCode" = $1',
          ['USD'],
        )
      )[0].rate,
      '1.000000000000000',
    );
    await service.synchronize();
    assert.equal(calls, 1, 'cooldown must not consume a request');
    stage = 'shared lock';
    await repository.withSyncLock(async () => {
      const concurrent = await service.synchronize();
      assert.equal(concurrent.reason, 'CURRENCY_SYNC_IN_PROGRESS');
      assert.equal(calls, 1, 'a different connection must share the same lock');
    });

    await expireCooldown();
    assert.equal((await service.synchronize()).status, 'skipped');
    assert.equal(
      (await repository.getStatus()).lastRun.errorCode,
      'CURRENCY_UNCHANGED',
    );
    assert.equal(
      (
        await db.query(
          'SELECT count(*)::int AS count FROM exchange_rate_batches',
        )
      )[0].count,
      1,
    );

    await expireCooldown();
    stage = 'older snapshot';
    timestamp -= 3600;
    assert.equal((await service.synchronize()).status, 'skipped');
    assert.equal(
      (await repository.getStatus()).lastRun.errorCode,
      'CURRENCY_OUTDATED_RESPONSE',
    );

    await expireCooldown();
    stage = 'newer snapshot';
    timestamp += 7200;
    const second = await service.synchronize();
    assert.equal(second.status, 'succeeded');
    assert.notEqual(second.batchId, first.batchId);
    assert.equal(
      (
        await db.query(
          'SELECT count(*)::int AS count FROM exchange_rate_batches WHERE "isActive" = true',
        )
      )[0].count,
      1,
    );
    stage = 'local conversions from one active batch';
    await db.query(
      'UPDATE exchange_rates SET rate = 300 WHERE "batchId" = $1 AND "currencyCode" = $2',
      [first.batchId, 'CRC'],
    );
    await db.query(
      'INSERT INTO exchange_rates ("batchId", "currencyCode", rate) VALUES ($1, $2, $3)',
      [first.batchId, 'JPY', '150'],
    );
    const cross = await conversions.convert({
      amount: '100',
      from: 'EUR',
      to: 'CRC',
    });
    assert.equal(cross.converted.amount, '54347.83');
    assert.equal(cross.batchId, second.batchId);
    assert.equal(cross.stale, false);
    assert.equal(
      (await conversions.convert({ amount: '250000', from: 'CRC', to: 'USD' }))
        .converted.amount,
      '500.00',
    );
    assert.equal(
      (await conversions.convert({ amount: '1', from: 'USD', to: 'JPY' }))
        .reason,
      'CURRENCY_RATE_MISSING',
    );
    await db.query(
      `UPDATE exchange_rate_batches SET "providerUpdatedAt" = "providerUpdatedAt" - interval '49 hours' WHERE id = $1`,
      [second.batchId],
    );
    assert.equal(
      (await conversions.convert({ amount: '1', from: 'USD', to: 'CRC' }))
        .stale,
      true,
    );
    await db.query(
      `UPDATE exchange_rate_batches SET "providerUpdatedAt" = "providerUpdatedAt" + interval '49 hours' WHERE id = $1`,
      [second.batchId],
    );
    await assert.rejects(
      () =>
        db.query(
          'UPDATE exchange_rate_batches SET "isActive" = true WHERE id = $1',
          [first.batchId],
        ),
      (e) => e.code === '23505',
    );
    stage = 'constraints';
    for (const rate of ['0', '-1', 'NaN', 'Infinity']) {
      await assert.rejects(
        () =>
          db.query(
            'INSERT INTO exchange_rates ("batchId", "currencyCode", rate) VALUES ($1, $2, $3)',
            [second.batchId, 'JPY', rate],
          ),
        (e) => ['23514', '22003'].includes(e.code),
      );
    }

    await expireCooldown();
    stage = 'provider failure';
    fail = true;
    await assert.rejects(
      () => service.synchronize(),
      (e) => e.getResponse().code === 'CURRENCY_HTTP_429',
    );
    status = await repository.getStatus();
    assert.equal(status.activeBatch.id, second.batchId);
    assert.equal(status.lastRun.status, 'failed');

    // Inject a storage failure after insertion starts: the old snapshot must survive.
    stage = 'storage rollback';
    const runId = await repository.startRun(runner);
    await assert.rejects(() =>
      repository.saveSnapshot(runner, runId, {
        updatedAt: new Date((timestamp + 3600) * 1000),
        rates: { USD: '1', CRC: '-5' },
      }),
    );
    await repository.finishRun(
      runner,
      runId,
      'failed',
      null,
      'CURRENCY_STORAGE_FAILED',
    );
    assert.equal((await repository.getStatus()).activeBatch.id, second.batchId);
    assert.equal(
      (
        await db.query(
          'SELECT count(*)::int AS count FROM exchange_rate_batches',
        )
      )[0].count,
      2,
    );

    stage = 'migration down/up';
    await migration.down(runner);
    assert.equal(await runner.hasTable('exchange_rates'), false);
    await migration.up(runner);
    await symbolsMigration.up(runner);
    assert.deepEqual(await repository.getStatus(), {
      activeBatch: null,
      lastRun: null,
    });
    stage = 'automatic startup recovery';
    fail = false;
    assert.equal(
      (await service.synchronize({ automatic: true })).status,
      'succeeded',
    );
    const afterRecovery = calls;
    assert.equal(
      (await service.synchronize({ automatic: true })).reason,
      'CURRENCY_UP_TO_DATE',
    );
    assert.equal(calls, afterRecovery);

    // Move only this temporary history before Costa Rica's local midnight.
    await db.query(`UPDATE currency_sync_runs SET
      "startedAt" = (date_trunc('day', now() AT TIME ZONE 'America/Costa_Rica') AT TIME ZONE 'America/Costa_Rica') - interval '2 minutes',
      "finishedAt" = (date_trunc('day', now() AT TIME ZONE 'America/Costa_Rica') AT TIME ZONE 'America/Costa_Rica') - interval '1 minute'`);
    assert.equal((await repository.automaticDecision(runner)).due, true);
    assert.equal(
      (await service.synchronize({ automatic: true })).status,
      'skipped',
    );
    assert.equal(calls, afterRecovery + 1);
    assert.equal(
      (await repository.automaticDecision(runner)).reason,
      'CURRENCY_UP_TO_DATE',
    );

    stage = 'durable retry policy';
    await db.query('DELETE FROM currency_sync_runs');
    fail = true;
    await assert.rejects(
      () => service.synchronize({ automatic: true }),
      (e) => e.getResponse().code === failureCode,
    );
    const afterFailure = calls;
    assert.equal(
      (await service.synchronize({ automatic: true })).reason,
      'CURRENCY_RETRY_PENDING',
    );
    assert.equal(calls, afterFailure);

    await db.query('DELETE FROM currency_sync_runs');
    failureCode = 'CURRENCY_PROVIDER_405';
    await assert.rejects(
      () => service.synchronize({ automatic: true }),
      (e) => e.getResponse().code === failureCode,
    );
    const afterQuota = calls;
    assert.equal(
      (await service.synchronize({ automatic: true })).reason,
      'CURRENCY_REQUIRES_ATTENTION',
    );
    assert.equal(calls, afterQuota);

    await db.query('DELETE FROM currency_sync_runs');
    for (let attempt = 0; attempt < 3; attempt++) {
      const id = await repository.startRun(runner);
      await repository.finishRun(
        runner,
        id,
        'failed',
        null,
        'CURRENCY_HTTP_503',
      );
    }
    assert.equal(
      (await service.synchronize({ automatic: true })).reason,
      'CURRENCY_DAILY_ATTEMPTS_EXHAUSTED',
    );
    assert.equal(calls, afterQuota);
    console.log(
      'PostgreSQL: conversiones locales desde un mismo lote activo, tasas faltantes/desactualizadas, migraciones, bloqueos, recuperación y reintentos persistidos: correcto.',
    );
  } catch (error) {
    console.error(
      'Verificación de monedas falló (' +
        stage +
        '): ' +
        (error.code || error.name || 'error'),
    );
    process.exitCode = 1;
  } finally {
    if (runner) {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      await runner.release();
    }
    if (db.isInitialized) await db.destroy();
    if (created) await control.query(`DROP SCHEMA "${schema}" CASCADE`);
    if (control.isInitialized) await control.destroy();
    console.log(
      'Esquema temporal eliminado; no se modificaron datos existentes ni se consultó CurrencyAPI.',
    );
  }
})();
