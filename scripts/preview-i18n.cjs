// Local QA server: real controllers/guards and PostgreSQL, all fixture changes roll back.
// No recovery worker, mail transport or currency scheduler is started.
const fs = require('node:fs');
const { randomUUID, randomBytes } = require('node:crypto');
const bcrypt = require('bcrypt');
require('node:dns').setDefaultResultOrder('ipv4first');
const env = { ...require('dotenv').parse(fs.readFileSync('.env')), ...process.env };
Object.assign(process.env, env, { DB_SYNCHRONIZE: 'false', CURRENCY_SYNC_ENABLED: 'false' });
const { DataSource } = require('typeorm');
const { Test } = require('@nestjs/testing');
const { ValidationPipe, ServiceUnavailableException } = require('@nestjs/common');
const { AppModule } = require('../dist/src/app.module');
const { PasswordRecoveryService } = require('../dist/src/auth/password-recovery.service');
const { BrevoMailService } = require('../dist/src/mail/brevo-mail.service');
const { CurrencySchedulerService } = require('../dist/src/currency/currency-scheduler.service');
const { User } = require('../dist/src/user/entities/user.entity');
const { Role } = require('../dist/src/role/entities/role.entity');
const { validationException } = require('../dist/src/common/validation-exception');
const db = new DataSource({ type: 'postgres', host: env.DB_HOST, port: +env.DB_PORT,
  username: env.DB_USERNAME, password: env.DB_PASSWORD, database: env.DB_DATABASE,
  entities: [__dirname + '/../dist/**/*.entity.js'], synchronize: false, migrationsRun: false,
  logging: false, extra: { connectionTimeoutMillis: 10000 } });
let app, runner, stopping;
async function stop() {
  if (stopping) return stopping;
  stopping = (async () => {
    if (runner?.isTransactionActive) await runner.rollbackTransaction();
    if (runner) await runner.release();
    if (app) await app.close();
    if (db.isInitialized) await db.destroy();
    console.log('QA: transacción revertida y servidor cerrado.');
  })();
  return stopping;
}
(async () => {
  await db.initialize();
  runner = db.createQueryRunner(); await runner.connect(); await runner.startTransaction();
  // Bind every application repository/transaction/query to this disposable transaction.
  db.manager = runner.manager;
  db.query = (...args) => runner.query(...args);
  const password = randomBytes(18).toString('base64url');
  const hash = await bcrypt.hash(password, 10);
  const suffix = randomUUID().slice(0, 8);
  for (const name of ['CLIENT', 'OWNER', 'ADMIN']) {
    const role = await runner.manager.findOneByOrFail(Role, { name, isActive: true });
    const email = `i18n-${name.toLowerCase()}-${suffix}@example.invalid`;
    await runner.manager.save(User, { idCard: `${name}-${suffix}`, name: 'I18n QA', surname1: name,
      email, phoneNumber: '88888888', birthdate: '2000-01-01', password: hash,
      isActive: true, sessionVersion: 0, Roles: [role] });
    console.log(`QA ${name}: ${email}`);
  }
  console.log(`QA disposable password: ${password}`);
  const disabled = () => { throw new ServiceUnavailableException('QA: outbound disabled'); };
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DataSource).useValue(db)
    .overrideProvider(PasswordRecoveryService).useValue({ request: disabled, reset: disabled })
    .overrideProvider(BrevoMailService).useValue({ sendPasswordReset: disabled })
    .overrideProvider(CurrencySchedulerService).useValue({})
    .compile();
  app = module.createNestApplication({ logger: false });
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, exceptionFactory: validationException }));
  await app.listen(3005, '127.0.0.1');
  console.log('QA http://127.0.0.1:3005 ready (auto-stop 15 minutes).');
  const timer = setTimeout(() => void stop(), 15 * 60 * 1000); timer.unref();
  process.on('SIGINT', () => void stop()); process.on('SIGTERM', () => void stop());
})().catch(async error => { console.error('QA failed:', error.code || error.name); process.exitCode = 1; await stop(); });
