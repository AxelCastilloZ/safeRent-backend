// Repairs legacy Dropbox records after the storage/url columns were added.
process.loadEnvFile('.env');
require('node:dns').setDefaultResultOrder('ipv4first');
const { Client } = require('pg');
const { ConfigService } = require('@nestjs/config');
const { DropboxService } = require('../dist/src/dropbox/dropbox.service');
const apply = process.argv.includes('--apply');
const propertyId = Number(
  process.argv.find((arg) => arg.startsWith('--property-id='))?.split('=')[1],
);
if (!Number.isSafeInteger(propertyId) || propertyId <= 0) {
  console.error(
    'Indica la propiedad: --property-id=39. Solo se recuperan enlaces compartidos existentes.',
  );
  process.exit(1);
}
const db = new Client({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  connectionTimeoutMillis: 15000,
});
const dropbox = new DropboxService(new ConfigService());
const prefix =
  '/' +
  (process.env.DROPBOX_ROOT_FOLDER || 'SafeRent')
    .replace(/^\/+|\/+$/g, '')
    .toLowerCase() +
  '/propiedades/';
(async () => {
  try {
    await db.connect();
    await db.query('BEGIN');
    const rows = (
      await db.query(
        `SELECT id,path FROM property_file WHERE "propertyId"=$3 AND left(lower(path),$1)=$2 AND (storage <> 'dropbox' OR url IS NULL OR url='') FOR UPDATE`,
        [prefix.length, prefix, propertyId],
      )
    ).rows;
    console.log(
      JSON.stringify({
        apply,
        files: rows.map((row) => ({ id: row.id, path: row.path })),
      }),
    );
    if (!apply) {
      await db.query('ROLLBACK');
      return;
    }
    for (const row of rows) {
      const metadata = await dropbox.metadata(row.path);
      const url = await dropbox.existingSharedLink(row.path);
      await db.query(
        `UPDATE property_file SET storage='dropbox',url=$1,rev=$2 WHERE id=$3 AND path=$4`,
        [url, metadata.rev, row.id, row.path],
      );
    }
    await db.query('COMMIT');
    console.log(`Archivos reparados: ${rows.length}.`);
  } catch (error) {
    await db.query('ROLLBACK').catch(() => undefined);
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
})();
