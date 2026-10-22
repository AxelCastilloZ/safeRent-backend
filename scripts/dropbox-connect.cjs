// Local setup only: credentials never pass through the frontend or an HTTP response.
const fs = require('node:fs');
const http = require('node:http');
const { randomBytes, createHash, timingSafeEqual } = require('node:crypto');
try {
  process.loadEnvFile('.env');
} catch {}
const key = process.env.DROPBOX_APP_KEY;
const secret = process.env.DROPBOX_APP_SECRET;
if (!key || !secret) {
  console.error(
    'Configura DROPBOX_APP_KEY y DROPBOX_APP_SECRET en el .env del backend.',
  );
  process.exit(1);
}
const redirect =
  process.env.DROPBOX_REDIRECT_URI || 'http://localhost:53682/dropbox/callback';
const target = new URL(redirect);
if (
  target.protocol !== 'http:' ||
  target.hostname !== 'localhost' ||
  !target.port
) {
  console.error(
    'La conexión local requiere DROPBOX_REDIRECT_URI=http://localhost:53682/dropbox/callback',
  );
  process.exit(1);
}
const state = randomBytes(32).toString('hex');
const verifier = randomBytes(48).toString('base64url');
const params = new URLSearchParams({
  client_id: key,
  response_type: 'code',
  token_access_type: 'offline',
  redirect_uri: redirect,
  state,
  code_challenge: createHash('sha256').update(verifier).digest('base64url'),
  code_challenge_method: 'S256',
});
let processing = false;
const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const url = new URL(req.url, redirect);
  if (url.pathname !== target.pathname) {
    res.writeHead(404).end();
    return;
  }
  const received = Buffer.from(url.searchParams.get('state') || '');
  if (
    received.length !== state.length ||
    !timingSafeEqual(received, Buffer.from(state))
  ) {
    res.writeHead(400).end('Estado de autorización inválido.');
    return;
  }
  if (processing) {
    res.writeHead(409).end();
    return;
  }
  if (!url.searchParams.get('code')) {
    res.writeHead(400).end('Autorización cancelada.');
    return;
  }
  processing = true;
  try {
    const response = await fetch('https://api.dropboxapi.com/oauth2/token', {
      method: 'POST',
      signal: AbortSignal.timeout(30000),
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: url.searchParams.get('code'),
        client_id: key,
        client_secret: secret,
        redirect_uri: redirect,
        code_verifier: verifier,
      }),
    });
    if (!response.ok) throw new Error('authorization');
    const result = await response.json();
    if (!result.refresh_token) throw new Error('refresh token');
    const original = fs.existsSync('.env')
      ? fs.readFileSync('.env', 'utf8')
      : '';
    const entry = `DROPBOX_REFRESH_TOKEN=${result.refresh_token}`;
    const updated = /^DROPBOX_REFRESH_TOKEN=.*$/m.test(original)
      ? original.replace(/^DROPBOX_REFRESH_TOKEN=.*$/m, () => entry)
      : original + '\n' + entry + '\n';
    fs.writeFileSync('.env', updated);
    res.end(
      'Dropbox conectado. Puedes cerrar esta ventana y reiniciar el backend.',
    );
    console.log('Conexión guardada en .env. Reinicia el backend.');
  } catch {
    res
      .writeHead(500)
      .end(
        'No se pudo completar la conexión. Revisa la configuración e intenta nuevamente.',
      );
    console.error(
      'No se pudo completar la conexión. No se modificaron credenciales.',
    );
    process.exitCode = 1;
  } finally {
    clearTimeout(timeout);
    server.close();
  }
});
server.on('error', () => {
  console.error('No se pudo abrir el puerto local de autorización.');
  process.exit(1);
});
const timeout = setTimeout(
  () => {
    console.error('Tiempo de autorización agotado.');
    server.close();
    process.exitCode = 1;
  },
  5 * 60 * 1000,
);
server.listen(Number(target.port), 'localhost', () => {
  console.log(
    'Abre este enlace e inicia sesión con la cuenta Dropbox de SafeRent:\nhttps://www.dropbox.com/oauth2/authorize?' +
      params,
  );
});
