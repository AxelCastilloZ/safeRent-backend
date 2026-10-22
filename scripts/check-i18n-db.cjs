// Build first. Default is reversible; --apply runs pending migrations.
// --repair explicitly reapplies the two idempotent i18n migrations after schema drift.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
require('node:dns').setDefaultResultOrder('ipv4first');
const { DataSource } = require('typeorm');
const { ProfileLanguage1792627200000: ProfileMigration } = require('../dist/src/migrations/1792627200000-profile-language');
const { CatalogI18n1792713600000: CatalogMigration } = require('../dist/src/migrations/1792713600000-catalog-i18n');
const { ProfileService } = require('../dist/src/auth/profile.service');
const { ServiceService } = require('../dist/src/service/service.service');
const { User } = require('../dist/src/user/entities/user.entity');
const { Role } = require('../dist/src/role/entities/role.entity');
const { Service } = require('../dist/src/service/entities/service.entity');
const env = { ...require('dotenv').parse(fs.readFileSync('.env')), ...process.env };
const db = new DataSource({
  type: 'postgres', host: env.DB_HOST, port: Number(env.DB_PORT),
  username: env.DB_USERNAME, password: env.DB_PASSWORD, database: env.DB_DATABASE,
  entities: [__dirname + '/../dist/**/*.entity.js'],
  migrations: [__dirname + '/../dist/src/migrations/*.js'],
  synchronize: false, migrationsRun: false, logging: false,
  extra: { connectionTimeoutMillis: 10000 },
});
(async () => {
  let runner;
  try {
    await db.initialize();
    runner = db.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    await runner.query('CREATE TEMP TABLE "user" (id integer PRIMARY KEY) ON COMMIT DROP');
    for (const table of ['service', 'type_of_property']) {
      await runner.query(`CREATE TEMP TABLE "${table}" (id integer PRIMARY KEY, name varchar(100)) ON COMMIT DROP`);
    }
    await runner.query('INSERT INTO "user" VALUES (1)');
    await runner.query("INSERT INTO service VALUES (1, 'WiFi')");
    const profileMigration = new ProfileMigration();
    const catalogMigration = new CatalogMigration();
    for (let pass = 0; pass < 2; pass++) {
      await profileMigration.up(runner);
      await catalogMigration.up(runner);
    }
    assert.equal((await runner.query('SELECT "preferredLanguage" FROM "user"'))[0].preferredLanguage, null);
    assert.equal((await runner.query('SELECT "catalogCode" FROM service'))[0].catalogCode, 'service_wifi');
    await catalogMigration.down(runner);
    await profileMigration.down(runner);
    await profileMigration.up(runner);
    await catalogMigration.up(runner);
    await runner.rollbackTransaction();
    console.log('Migraciones: up/down/repetición verificadas en tablas temporales.');
    if (process.argv.includes('--apply')) {
      const applied = await db.runMigrations({ transaction: 'all' });
      console.log('Migraciones aplicadas:', applied.map(item => item.name));
    } else {
      assert.equal(await db.showMigrations(), false, 'Hay migraciones pendientes; ejecutar --apply en el destino autorizado.');
    }
    if (process.argv.includes('--repair')) {
      await runner.startTransaction();
      await profileMigration.up(runner);
      await catalogMigration.up(runner);
      await runner.commitTransaction();
      console.log('Reparación explícita: esquema i18n recreado sin modificar el historial ni nombres de catálogo.');
    }
    const columns = await runner.query(`SELECT table_name || '.' || column_name AS name FROM information_schema.columns
      WHERE table_schema = current_schema() AND ((table_name = 'user' AND column_name = 'preferredLanguage')
      OR (table_name IN ('service', 'type_of_property') AND column_name IN ('catalogCode', 'translations')))`);
    assert.equal(columns.length, 5, 'El historial de migraciones no coincide con el esquema i18n: faltan columnas. Investigar synchronize/backend antiguo; usar --repair solo para reparación autorizada.');
    await runner.startTransaction();
    const roles = await runner.manager.find(Role, { where: { isActive: true } });
    const profile = new ProfileService({ getRepository: entity => runner.manager.getRepository(entity) });
    const suffix = randomUUID();
    for (const roleName of ['CLIENT', 'OWNER', 'ADMIN']) {
      const role = roles.find(item => item.name === roleName);
      assert.ok(role, `Falta rol activo ${roleName}`);
      const user = await runner.manager.save(User, {
        idCard: `i18n-${roleName}-${suffix}`.slice(0, 50), name: 'I18n test', surname1: 'Temporary',
        email: `${roleName}-${suffix}@example.invalid`, phoneNumber: '88888888',
        birthdate: '2000-01-01', password: 'unusable-test-hash', isActive: true, Roles: [role],
      });
      for (const language of ['es', 'en', 'fr', 'pt']) {
        await profile.updateLanguage(user.id, language);
        const stored = await profile.get(user.id);
        assert.equal(stored.preferredLanguage, language);
        assert.deepEqual(stored.roles, [roleName]);
        assert.equal(stored.email, user.email);
      }
    }
    const catalog = new ServiceService(runner.manager.getRepository(Service));
    const translations = Object.fromEntries(['es', 'en', 'fr', 'pt'].map(language => [language, {
      name: `${language} ${suffix}`, description: `Descripción / Description / Descrição ${language}`,
    }]));
    const created = await catalog.create({ name: `i18n-${suffix}`, translations });
    assert.deepEqual((await catalog.findOne(created.id)).translations, translations);
    translations.fr.description = 'Texte modifié avec accents : é à ç';
    await catalog.update(created.id, { translations });
    assert.deepEqual((await catalog.findOne(created.id)).translations, translations);
    await runner.query('SAVEPOINT invalid_language');
    await assert.rejects(() => runner.query('UPDATE "user" SET "preferredLanguage" = $1 WHERE email = $2', ['de', `CLIENT-${suffix}@example.invalid`]), error => error.code === '23514');
    await runner.query('ROLLBACK TO SAVEPOINT invalid_language');
    console.log('Persistencia PostgreSQL: 3 roles × 4 idiomas; identidad/roles conservados; catálogo JSON creado/editado/leído; idioma inválido rechazado.');
    const counts = await runner.query('SELECT (SELECT count(*) FROM service WHERE "catalogCode" IS NOT NULL)::int AS services, (SELECT count(*) FROM type_of_property WHERE "catalogCode" IS NOT NULL)::int AS types');
    console.log('Entradas con código de traducción:', counts[0]);
  } catch (error) {
    console.error('Verificación falló:', error.code || error.name || 'error', error.code === 'ERR_ASSERTION' ? error.message : '');
    process.exitCode = 1;
  } finally {
    if (runner) {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      await runner.release();
    }
    if (db.isInitialized) await db.destroy();
    console.log('Fixtures revertidos; no se modificaron cuentas existentes ni se enviaron correos.');
  }
})();
