// Run after building. Preview by default; --apply moves Dropbox folders and DB paths.
process.loadEnvFile('.env');
require('node:dns').setDefaultResultOrder('ipv4first');
const { Client } = require('pg');
const { resourceFolder } = require('../dist/src/dropbox/resource-folder');
const apply = process.argv.includes('--apply');
const db = new Client({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  connectionTimeoutMillis: 15000,
});
const root =
  '/' +
  (process.env.DROPBOX_ROOT_FOLDER || 'SafeRent')
    .replace(/^\/+|\/+$/g, '')
    .toLowerCase();
let token;
async function rpc(endpoint, body) {
  const response = await fetch(`https://api.dropboxapi.com/2/${endpoint}`, {
    method: 'POST',
    signal: AbortSignal.timeout(60000),
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(`Dropbox ${endpoint}: HTTP ${response.status}`);
    error.summary = data.error_summary;
    throw error;
  }
  return data;
}
async function exists(path) {
  try {
    await rpc('files/get_metadata', { path });
    return true;
  } catch (error) {
    if (error.summary?.startsWith('path/not_found/')) return false;
    throw error;
  }
}
async function main() {
  const moved = [];
  let committed = false;
  try {
    await db.connect();
    await db.query('BEGIN');
    await db.query(
      'LOCK TABLE property, property_file, "user" IN SHARE ROW EXCLUSIVE MODE',
    );
    const properties = (
      await db.query(
        `SELECT p.id,p.title,f.path FROM property p JOIN property_file f ON f."propertyId"=p.id WHERE f.storage='dropbox'`,
      )
    ).rows;
    const users = (
      await db.query(
        `SELECT id,name,surname1,surname2,"profilePhotoPath" FROM "user" WHERE "profilePhotoPath" IS NOT NULL`,
      )
    ).rows;
    const plans = new Map();
    function plan(path, category, name, id, fallback) {
      const base = `${root}/${category}/`;
      if (!path.toLowerCase().startsWith(base))
        throw new Error('Ruta fuera de la carpeta esperada.');
      const segment = path.slice(base.length).split('/')[0];
      const from = base + segment;
      const to = base + resourceFolder(name, id, fallback);
      if (from.toLowerCase() !== to.toLowerCase()) {
        if (plans.has(from) && plans.get(from).to !== to)
          throw new Error('Carpeta compartida por recursos distintos.');
        plans.set(from, { from, to });
      }
    }
    for (const p of properties)
      plan(p.path, 'propiedades', p.title, p.id, 'propiedad');
    for (const u of users)
      plan(
        u.profilePhotoPath,
        'usuarios',
        [u.name, u.surname1, u.surname2].filter(Boolean).join(' '),
        u.id,
        'usuario',
      );
    console.log(
      JSON.stringify({ apply, folders: [...plans.values()] }, null, 2),
    );
    if (!apply || !plans.size) {
      await db.query('ROLLBACK');
      return;
    }
    const auth = await fetch('https://api.dropboxapi.com/oauth2/token', {
      method: 'POST',
      signal: AbortSignal.timeout(30000),
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: process.env.DROPBOX_REFRESH_TOKEN,
        client_id: process.env.DROPBOX_APP_KEY,
        client_secret: process.env.DROPBOX_APP_SECRET,
      }),
    });
    if (!auth.ok) throw new Error(`Autenticación Dropbox: HTTP ${auth.status}`);
    token = (await auth.json()).access_token;
    // Complete preflight before the first move. Never overwrite or merge a destination.
    for (const p of plans.values()) {
      if (!(await exists(p.from)))
        throw new Error(`No existe la carpeta de origen: ${p.from}`);
      if (await exists(p.to))
        throw new Error(
          `El destino ya existe: ${p.to}. No se movieron archivos.`,
        );
    }
    for (const p of plans.values()) {
      await rpc('files/move_v2', {
        from_path: p.from,
        to_path: p.to,
        autorename: false,
      });
      moved.push(p);
      const fromPrefix = p.from.toLowerCase() + '/';
      const toPrefix = p.to.toLowerCase() + '/';
      await db.query(
        `UPDATE property_file SET path=$1 || substring(path FROM $2::integer) WHERE storage='dropbox' AND left(lower(path),$3)=$4`,
        [toPrefix, fromPrefix.length + 1, fromPrefix.length, fromPrefix],
      );
      await db.query(
        `UPDATE "user" SET "profilePhotoPath"=$1 || substring("profilePhotoPath" FROM $2::integer) WHERE left(lower("profilePhotoPath"),$3)=$4`,
        [toPrefix, fromPrefix.length + 1, fromPrefix.length, fromPrefix],
      );
    }
    await db.query('COMMIT');
    committed = true;
    console.log(
      `Carpetas actualizadas: ${moved.length}. Rutas de PostgreSQL actualizadas.`,
    );
  } catch (error) {
    await db.query('ROLLBACK').catch(() => undefined);
    if (!committed) {
      for (const p of moved.reverse()) {
        try {
          await rpc('files/move_v2', {
            from_path: p.to,
            to_path: p.from,
            autorename: false,
          });
        } catch {
          console.error(
            `Requiere recuperación manual de carpeta: ${p.to} -> ${p.from}`,
          );
        }
      }
    }
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}
main();
