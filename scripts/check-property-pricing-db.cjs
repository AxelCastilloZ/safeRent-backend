// All test tables shadow real tables on one connection and disappear on rollback.
const fs = require('node:fs');
const assert = require('node:assert/strict');
require('node:dns').setDefaultResultOrder('ipv4first');
const { DataSource } = require('typeorm');
const { Property } = require('../dist/src/property/entities/property.entity');
const { PropertyService } = require('../dist/src/property/property.service');
const {
  PropertyPricingService,
} = require('../dist/src/property/property-pricing.service');
const {
  CurrencyRepository,
} = require('../dist/src/currency/currency.repository');
const { CurrencyService } = require('../dist/src/currency/currency.service');
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
  entities: [__dirname + '/../dist/**/*.entity.js'],
  synchronize: false,
  migrationsRun: false,
  logging: false,
  extra: { connectionTimeoutMillis: 10000 },
});
(async () => {
  let runner;
  let stage = 'connection';
  try {
    await db.initialize();
    runner = db.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    stage = 'temporary tables';
    const meta = db.getMetadata(Property);
    const tables = new Set([
      meta.tableName,
      ...['typeOfProperty', 'services', 'files', 'iconDescriptions'].map(
        (name) =>
          meta.relations.find((relation) => relation.propertyName === name)
            .inverseEntityMetadata.tableName,
      ),
      meta.relations.find((relation) => relation.propertyName === 'services')
        .junctionEntityMetadata.tableName,
      'exchange_rate_batches',
      'exchange_rates',
    ]);
    for (const table of tables) {
      assert.match(table, /^[a-z_]+$/);
      await runner.query(
        `CREATE TEMP TABLE "${table}" (LIKE public."${table}" INCLUDING DEFAULTS) ON COMMIT DROP`,
      );
    }
    await runner.query(
      `INSERT INTO exchange_rate_batches (id, "providerUpdatedAt", "isActive") VALUES (900001, now(), true)`,
    );
    for (const [code, rate] of [
      ['USD', '1'],
      ['CRC', '500'],
      ['EUR', '0.8'],
    ]) {
      await runner.query(
        'INSERT INTO exchange_rates ("batchId", "currencyCode", rate) VALUES (900001, $1, $2)',
        [code, rate],
      );
    }
    for (const [id, currency, cost, status] of [
      [1, 'CRC', '250000', 'ACTIVE'],
      [2, 'USD', '500', 'ACTIVE'],
      [3, 'EUR', '400', 'ACTIVE'],
      [4, 'USD', '1000', 'ACTIVE'],
      [5, 'JPY', '100', 'ACTIVE'],
      [6, 'USD', '100', 'DRAFT'],
      [7, 'EUR', '123.45', 'ACTIVE'],
    ]) {
      await runner.query(
        `INSERT INTO property (id,title,description,cost,"typeOfCoin",address,"ownerId",status) VALUES ($1,'Pricing test','Temporary',$2,$3,'Temporary',1,$4)`,
        [id, cost, currency, status],
      );
    }
    const rateRepository = new CurrencyRepository({
      query: (...args) => runner.query(...args),
    });
    const pricing = new PropertyPricingService(
      rateRepository,
      new CurrencyService(rateRepository),
    );
    const service = new PropertyService(
      runner.manager.getRepository(Property),
      {},
      {},
      {},
      {},
      {},
      {},
    );
    const list = async (query) => {
      const context = await pricing.prepare(query);
      const result = await service.findAll(query, context);
      return { ...result, data: await pricing.decorate(result.data, context) };
    };
    stage = 'mixed-currency filters before pagination';
    const bounded = {
      displayCurrency: 'CRC',
      minPrice: 250000,
      maxPrice: 250000,
      sort: 'price_asc',
      limit: 1,
    };
    for (const [page, expectedId] of [
      [1, 3],
      [2, 2],
      [3, 1],
    ]) {
      const result = await list({ ...bounded, page });
      assert.equal(result.total, 3);
      assert.equal(result.totalPages, 3);
      assert.equal(result.data[0].id, expectedId);
      assert.equal(result.data[0].displayPrice.converted.amount, '250000.00');
    }
    stage = 'source currency and final rounding';
    assert.deepEqual(
      (await list({ ...bounded, sourceCurrency: 'USD' })).data.map(
        (row) => row.id,
      ),
      [2],
    );
    const rounded = await list({
      displayCurrency: 'USD',
      minPrice: 154.31,
      maxPrice: 154.31,
    });
    assert.deepEqual(
      rounded.data.map((row) => row.id),
      [7],
    );
    assert.equal(rounded.data[0].displayPrice.converted.amount, '154.31');
    const descending = await list({
      displayCurrency: 'CRC',
      sort: 'price_desc',
    });
    assert.equal(descending.data[0].id, 4);
    assert.equal(descending.data.at(-1).id, 5);
    assert.equal(
      descending.data.at(-1).displayPrice.reason,
      'CURRENCY_RATE_MISSING',
    );
    assert.equal(
      (await list({ displayCurrency: 'CRC' })).data.find((row) => row.id === 2)
        .cost,
      '500.00',
    );
    stage = 'pinned historical batch';
    await runner.query('UPDATE exchange_rate_batches SET "isActive" = false');
    await runner.query(
      `INSERT INTO exchange_rate_batches (id,"providerUpdatedAt","isActive") VALUES (900002,now(),true)`,
    );
    await runner.query(
      `INSERT INTO exchange_rates ("batchId","currencyCode",rate) VALUES (900002,'USD',1),(900002,'CRC',1000),(900002,'EUR',0.8)`,
    );
    const pinned = await list({ ...bounded, rateBatchId: 900001 });
    assert.equal(pinned.total, 3);
    assert.equal(pinned.data[0].displayPrice.batchId, 900001);
    assert.equal((await list(bounded)).total, 1);
    assert.equal((await list({ ...bounded, rateBatchId: 0 })).total, 1);
    stage = 'missing active snapshot';
    await runner.query('UPDATE exchange_rate_batches SET "isActive" = false');
    const fallback = await list(bounded);
    assert.equal(fallback.total, 1);
    assert.equal(fallback.data[0].id, 1);
    stage = 'rate-table outage fallback';
    await runner.query('ALTER TABLE exchange_rates RENAME TO pricing_hidden_rates');
    await runner.query('CREATE TEMP TABLE exchange_rates (unrelated integer) ON COMMIT DROP');
    const independent = await list({ displayCurrency: 'CRC', rateBatchId: 0, sort: 'price_asc' });
    assert.equal(independent.total, 6);
    assert.equal(independent.data[0].id, 1);
    console.log(
      'PostgreSQL: filtros mixtos, orden antes de paginar, redondeo, moneda original, precios faltantes, lote fijado y precio publicado intacto: correcto.',
    );
  } catch (error) {
    console.error(
      'Verificación de precios falló (' +
        stage +
        '): ' +
        (error.code || error.name || 'error'),
    );
    if (error.name === 'AssertionError') console.error(error.message);
    process.exitCode = 1;
  } finally {
    if (runner) {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      await runner.release();
    }
    if (db.isInitialized) await db.destroy();
    console.log(
      'Rollback completo: tablas temporales eliminadas; propiedades, tasas y cuentas existentes intactas. Sin solicitudes a CurrencyAPI.',
    );
  }
})();
