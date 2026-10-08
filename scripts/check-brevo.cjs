const fs = require('node:fs');
const dotenv = require('dotenv');
const { isEmail } = require('class-validator');
const env = dotenv.parse(fs.readFileSync('.env'));
let invalid = false;
function check(key, ok) { console.log(`${key}: ${ok ? 'válido' : 'REVISAR'}`); if (!ok) invalid = true; }
check('BREVO_API_KEY', !!env.BREVO_API_KEY?.trim() && !/^(\.\.\.|YOUR_|replace|changeme)/i.test(env.BREVO_API_KEY));
check('BREVO_SENDER_EMAIL', isEmail(env.BREVO_SENDER_EMAIL ?? ''));
check('BREVO_SENDER_NAME', !!env.BREVO_SENDER_NAME?.trim());
check('BREVO_RESET_TEMPLATE_ID', /^[1-9]\d*$/.test(env.BREVO_RESET_TEMPLATE_ID ?? ''));
check('PASSWORD_RESET_TTL_MINUTES', /^[1-9]\d*$/.test(env.PASSWORD_RESET_TTL_MINUTES ?? '') && Number(env.PASSWORD_RESET_TTL_MINUTES) <= 60);
let origin;
try { const u = new URL(env.FRONTEND_URL); origin = u; check('FRONTEND_URL', !u.username && !u.password && !u.search && !u.hash && u.pathname === '/' && (u.protocol === 'https:' || (u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)))); console.log('FRONTEND_URL entorno: ' + (u.protocol === 'http:' ? 'desarrollo local' : 'HTTPS')); } catch { check('FRONTEND_URL', false); }
check('PASSWORD_RECOVERY_ENCRYPTION_KEY', /^[a-fA-F0-9]{64}$/.test(env.PASSWORD_RECOVERY_ENCRYPTION_KEY ?? ''));
if (invalid) process.exit(1);
if (!process.argv.includes('--remote')) process.exit(0);
(async () => {
  const headers = { 'api-key': env.BREVO_API_KEY.trim() };
  for (const [label, path] of [['cuenta', '/account'], ['remitentes', '/senders'], ['plantilla', `/smtp/templates/${env.BREVO_RESET_TEMPLATE_ID}`]]) {
    try {
      const res = await fetch(`https://api.brevo.com/v3${path}`, { headers, signal: AbortSignal.timeout(10000) });
      console.log(`Brevo ${label}: HTTP ${res.status}`);
      if (!res.ok) {
        const failure = await res.json().catch(() => ({}));
        const reason = String(failure.message ?? '').toLowerCase();
        console.log('Motivo: ' + (res.status === 404 ? 'Recurso configurado no existe en esta cuenta de Brevo' : reason.includes('ip') && (reason.includes('unauthor') || reason.includes('unrecogn') || reason.includes('whitelist')) ? 'IP no autorizada en Brevo' : reason.includes('key') ? 'Clave API rechazada por Brevo' : 'Acceso rechazado; revisar credenciales/permisos en Brevo'));
        invalid = true; continue;
      }
      const data = await res.json();
      if (label === 'remitentes') {
        const sender = data.senders?.find(s => s.email?.trim().toLowerCase() === env.BREVO_SENDER_EMAIL.trim().toLowerCase());
        check('Correo configurado coincide con un remitente de Brevo', !!sender);
        if (sender) check('Remitente está activo', sender.active === true);
      }
      if (label === 'plantilla') {
        check('Plantilla activa', data.isActive === true);
        check('Plantilla contiene RESET_URL', /params\.RESET_URL/.test(data.htmlContent ?? ''));
        console.log('Plantilla contiene EXPIRES_MINUTES: ' + /params\.EXPIRES_MINUTES/.test(data.htmlContent ?? ''));
      }
      if (label === 'cuenta') console.log('Cuenta SMTP habilitada: ' + (data.relay?.enabled ?? 'no informado'));
    } catch { console.log(`Brevo ${label}: no se pudo verificar conexión`); invalid = true; }
  }
  if (invalid) process.exitCode = 1;
})();


