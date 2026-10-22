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
    process.stdin.pause();
    // Drain HTTP handlers before rollback, so an in-flight handler cannot write after it.
    const server = app?.getHttpServer();
    if (server?.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
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
  const accounts = {};
  for (const name of ['CLIENT', 'OWNER', 'ADMIN']) {
    const role = await runner.manager.findOneByOrFail(Role, { name, isActive: true });
    const email = `i18n-${name.toLowerCase()}-${suffix}@example.invalid`;
    accounts[name] = await runner.manager.save(User, { idCard: `${name}-${suffix}`, name: 'I18n QA', surname1: name,
      email, phoneNumber: '88888888', birthdate: '2000-01-01', password: hash,
      isActive: true, sessionVersion: 0, Roles: [role] });
    if (!process.argv.includes('--check')) console.log(`QA ${name}: ${email}`);
  }
  if (!process.argv.includes('--check')) console.log(`QA disposable password: ${password}`);
  if (process.argv.includes('--fixtures')) {
    const { Property } = require('../dist/src/property/entities/property.entity');
    const { Conversation } = require('../dist/src/messages/conversation/entities/conversation.entity');
    const { Message } = require('../dist/src/messages/message/entities/message.entity');
    const { PropertyComment } = require('../dist/src/comment/entities/property-comment.entity');
    const { SavedProperty } = require('../dist/src/saved-property/entities/saved-property.entity');
    let active;
    for (const status of ['DRAFT', 'PENDING', 'CHANGES_REQUESTED', 'INACTIVE', 'ACTIVE']) {
      const property = await runner.manager.save(Property, { title: `I18n QA ${status}`, description: 'Contenido ficticio: á é ç ã',
        cost: 500, typeOfCoin: 'CRC', address: 'San José', latitude: 9.935, longitude: -84.084,
        owner: accounts.OWNER, ownerId: accounts.OWNER.id, status,
        reviewNote: status === 'CHANGES_REQUESTED' ? 'QA: completar imágenes' : null,
        ...(status === 'ACTIVE' ? { reservedTenantId: accounts.CLIENT.id, reservedTenantName: 'I18n QA CLIENT', reservedAt: new Date() } : {}) });
      if (status === 'ACTIVE') active = property;
    }
    const conversation = await runner.manager.save(Conversation, { property: active, participants: [accounts.CLIENT, accounts.OWNER] });
    await runner.manager.save(Message, { conversation, sender: accounts.CLIENT, message: 'Contenido ficticio: expérience / experiência' });
    await runner.manager.save(PropertyComment, { property: active, author: accounts.CLIENT, content: 'Comentario ficticio: á é ç ã' });
    await runner.manager.save(SavedProperty, { user: accounts.CLIENT, property: active });
    console.log('QA populated fixture:', { propertyId: active.id, conversationId: conversation.id });
  }
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
  if (process.argv.includes('--check')) {
    try {
      const result = await require('./check-i18n-flows.cjs')({ runner, accounts, password, base: 'http://127.0.0.1:3005' });
      fs.writeFileSync('docs/i18n-flow-checks.json', JSON.stringify(result, null, 2) + '\n');
    } finally { await stop(); }
    return;
  }
  console.log('QA http://127.0.0.1:3005 ready (auto-stop 15 minutes).');
  const timer = setTimeout(() => void stop(), 15 * 60 * 1000); timer.unref();
  process.stdin.on('data', input => {
    if (input.toString().trim() === 'stop') { process.stdin.pause(); void stop(); }
  });
  process.on('SIGINT', () => void stop()); process.on('SIGTERM', () => void stop());
})().catch(async error => { console.error('QA failed:', error.code || error.name, ['ERR_ASSERTION', '42703'].includes(error.code) ? error.message : ''); process.exitCode = 1; await stop(); });
