// Backend-only maintenance commands; never bootstrap mail workers or HTTP servers.
const fs = require('node:fs');
require('node:dns').setDefaultResultOrder('ipv4first');
const { DataSource } = require('typeorm');
const { ConfigService } = require('@nestjs/config');
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
  CurrencyApiClient,
} = require('../dist/src/currency/currency-api.client');
const {
  CurrencySyncService,
} = require('../dist/src/currency/currency-sync.service');
const { CurrencyService } = require('../dist/src/currency/currency.service');
const {
  ProfileCurrency1792454400002,
} = require('../dist/src/migrations/1792454400002-profile-currency');

const env = {
  ...(fs.existsSync('.env')
    ? require('dotenv').parse(fs.readFileSync('.env'))
    : {}),
  ...process.env,
};
const command = process.argv[2];
if (!['prepare', 'sync', 'status', 'convert'].includes(command)) {
  console.error(
    'Uso: node scripts/currency.cjs prepare|sync|status|convert [monto origen destino]',
  );
  process.exitCode = 1;
} else {
  const db = new DataSource({
    type: 'postgres',
    host: env.DB_HOST,
    port: Number(env.DB_PORT),
    username: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    database: env.DB_DATABASE,
    synchronize: false,
    migrationsRun: false,
    migrations: [
      CurrencyRates1792454400000,
      CurrencyProviderCodes1792454400001,
      ProfileCurrency1792454400002,
    ],
    logging: false,
    extra: { connectionTimeoutMillis: 10000 },
  });
  (async () => {
    try {
      await db.initialize();
      if (command === 'prepare') {
        const applied = await db.runMigrations({ transaction: 'all' });
        console.log(
          JSON.stringify({ applied: applied.map((item) => item.name) }),
        );
      } else {
        const repository = new CurrencyRepository(db);
        const service = new CurrencySyncService(
          repository,
          new CurrencyApiClient(new ConfigService(env)),
        );
        const result =
          command === 'convert'
            ? await new CurrencyService(repository).convert({
                amount: process.argv[3],
                from: process.argv[4],
                to: process.argv[5],
              })
            : command === 'sync'
              ? await service.synchronize()
              : await service.getStatus();
        console.log(JSON.stringify(result, null, 2));
      }
    } catch (error) {
      // No external error messages/stacks: a provider URL could contain the key.
      const code = error?.getResponse?.()?.code;
      console.error(
        JSON.stringify({ code: code || 'CURRENCY_COMMAND_FAILED' }),
      );
      process.exitCode = 1;
    } finally {
      if (db.isInitialized) await db.destroy();
    }
  })();
}
