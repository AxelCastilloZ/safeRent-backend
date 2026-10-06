# Recuperación de contraseña y Brevo

## Estado e implementación

Implementado: pantallas `/forgot-password` y `/reset-password?token=...`, servicios Axios, hooks React Query, DTOs NestJS, endpoints públicos, tokens SHA-256 de un solo uso, actualización con bcrypt (coste 10), revocación de sesiones y cola persistente de envío en PostgreSQL.

La API responde sin revelar si una cuenta existe. La entrega de correos depende de Brevo y de su configuración externa.

## Contrato HTTP

`POST /auth/forgot-password` recibe `{ "identifier": "persona@example.com" }` o `{ "identifier": "001234567" }`. Recorta espacios; valida email o cédula de hasta 30 caracteres y conserva ceros iniciales. Responde HTTP 200 con `{ "message": "Si los datos corresponden a una cuenta activa, recibirás un enlace para cambiar tu contraseña." }`, tanto para cuentas activas como inexistentes/inactivas. La búsqueda y el envío se procesan en la cola; siempre se usa el email almacenado en la cuenta.

`POST /auth/reset-password` recibe `{ "token": "TOKEN_BASE64URL", "password": "NuevaClave123!" }`. No necesita JWT. Reutiliza exactamente las reglas de RegisterDto, incluidos los 72 bytes de bcrypt. La confirmación se valida en el frontend. Responde HTTP 200 con `{ "message": "Contraseña actualizada correctamente." }`. El frontend borra su sesión local y navega al login después de 2,5 segundos.

Token inexistente, expirado, usado o de usuario inactivo: HTTP 400 con el mismo mensaje. Formato/contraseña inválidos: HTTP 400. Límites excedidos: HTTP 429. Fallos de base de datos no se presentan como éxito.

## Persistencia y migraciones

- `password_reset_tokens`: userId, hash SHA-256 único, expiresAt, usedAt, createdAt. El token original nunca se guarda.
- `password_recovery_jobs`: identificador cifrado con AES-256-GCM, intentos y próxima ejecución. Se elimina al completar o agotar reintentos.
- `password_recovery_limits`: contadores por IP e identificador representados mediante HMAC, sin guardar estos datos en claro.
- Usuario: sessionVersion (revocación JWT) y passwordChangedAt (descarta solicitudes encoladas antes del cambio).

Migración: `src/migrations/1791244800000-password-recovery.ts`.

En desarrollo se conserva la sincronización existente de TypeORM: el backend crea las tablas/columnas al iniciar. En producción configurar `DB_SYNCHRONIZE=false`: TypeORM ejecuta la migración versionada al iniciar, sobre una base que ya tiene las tablas del proyecto. No habilitar synchronize en producción. La migración solo agrega tablas/columnas; su down elimina los datos de recuperación y campos añadidos. No ejecutar down con JWT de versiones activas.

No se aplicaron cambios a una base externa durante la implementación. Reiniciar el backend para cargar entidades, DTOs, worker y cambios de sesión.

## Consumo y revocación

Generación con `randomBytes(32).toString('base64url')`. Vigencia configurable de 1 a 60 minutos (15 por defecto). Máximo tres enlaces activos por usuario.

El cambio usa una transacción PostgreSQL: lee referencia, bloquea usuario y token (en ese orden), vuelve a comprobar vigencia/uso, hashea la contraseña, incrementa sessionVersion y marca todos los enlaces del usuario como usados. El bloqueo de usuario serializa cambios concurrentes y la generación de nuevos enlaces. Solo una petición puede consumir el mismo token.

Login agrega `sv` al JWT. JwtAuthGuard lo compara con sessionVersion de la cuenta. Los JWT antiguos sin sv se aceptan únicamente mientras la versión sea cero; después del primer cambio quedan revocados. No hay refresh tokens en este proyecto.

## Cola, reintentos y límites

Worker cada segundo, por instancia del backend, con `FOR UPDATE SKIP LOCKED`: múltiples instancias pueden procesar trabajos diferentes. La cola sobrevive reinicios. Cifra el identificador antes de guardarlo y resuelve la cuenta en el worker.

La transacción de envío bloquea el usuario, comprueba hasta tres enlaces activos, genera un token, solicita el correo a Brevo y persiste únicamente su hash antes de confirmar la transacción. Una respuesta HTTP de Brevo confirma aceptación, no entrega final en la bandeja. Existe una pequeña ventana entre la aceptación del proveedor y el commit; si el proceso/base falla ahí, un correo puede contener un enlace inválido y el reintento puede enviar otro. El cliente puede solicitar un enlace nuevo. No se promete entrega exactamente una vez entre Brevo y PostgreSQL.

Timeout de Brevo: 8 segundos. Reintenta fallos de red, HTTP 429 y 5xx, máximo tres intentos, con esperas de 30 y 60 segundos. Errores de credenciales/permisos no se reintentan. Logs solo con categoría/código HTTP, sin correo, contraseña, token, URL ni claves. No se envía notificación adicional del cambio para evitar correos externos no necesarios.

Límites compartidos entre instancias: 10 solicitudes de recuperación por IP cada 15 minutos, tres por identificador y 20 intentos de cambio por IP. Limpieza por hora de tokens expirados, contadores vencidos y trabajos de más de una hora. El backend respeta `request.ip`; no confía en X-Forwarded-For por defecto. Si se usa un proxy, configurar trust proxy únicamente para los saltos/orígenes confiables de la infraestructura.

## Variables y verificación de Brevo

Solo backend; nunca exponer claves con prefijo VITE_. Plantilla de variables: `.env.brevo.example`.

- BREVO_API_KEY: API key de Brevo (no clave SMTP).
- BREVO_SENDER_EMAIL: remitente verificado y activo.
- BREVO_SENDER_NAME: nombre del remitente.
- BREVO_RESET_TEMPLATE_ID: ID entero positivo de plantilla activa.
- FRONTEND_URL: origen HTTPS fijo en producción; HTTP permitido solo para localhost/loopback en desarrollo. No rutas, credenciales ni parámetros.
- PASSWORD_RESET_TTL_MINUTES: 15 recomendado.
- PASSWORD_RECOVERY_ENCRYPTION_KEY: 32 bytes aleatorios en hexadecimal (64 caracteres), compartida entre instancias y conservada entre reinicios. Se agregó una clave nueva al .env local, sin tocar JWT_SECRET. Rotarla invalida el cifrado de trabajos pendientes y las claves de contadores; los trabajos no descifrables se descartan con un log genérico.

Ejecutar desde el backend:

```powershell
node scripts/check-brevo.cjs
node scripts/check-brevo.cjs --remote
```

El primer comando valida formato; el segundo hace consultas de solo lectura a cuenta, remitentes y plantilla. Nunca muestra secretos ni envía correos. Las claves se leen directamente del .env local.

Verificación realizada el 6 de octubre de 2026: las variables locales pasan formato. FRONTEND_URL corresponde a desarrollo local. Brevo respondió HTTP 401 indicando IP no autorizada: autorizar en Brevo la IP pública del equipo/servidor que ejecuta el backend y volver a ejecutar la verificación. El rechazo no demuestra que la API key sea incorrecta. No fue posible confirmar remitente ni plantilla mientras la IP siga bloqueada.

La plantilla debe usar `{{ params.RESET_URL }}` en el enlace y opcionalmente `{{ params.EXPIRES_MINUTES }}` en la duración. Configurar remitente/dominio verificados en Brevo.

El transporte usa `POST https://api.brevo.com/v3/smtp/email`, header `api-key` y cuerpo:

```json
{
  "sender": { "name": "SafeRent", "email": "remitente-verificado@example.com" },
  "to": [{ "email": "correo-almacenado-de-la-cuenta@example.com" }],
  "templateId": 123,
  "params": {
    "RESET_URL": "https://saferent.example/reset-password?token=TOKEN",
    "EXPIRES_MINUTES": 15
  }
}
```

Documentación oficial: https://developers.brevo.com/docs/send-a-transactional-email y https://developers.brevo.com/docs/api-key-authentication . Si se cambia a SMTP, usar clave SMTP: https://developers.brevo.com/docs/smtp-integration .

## Validación y límites de las pruebas

Pruebas de DTOs, contrato HTTP con servicios simulados, ciclo de recuperación con repositorios simulados, transporte Brevo simulado, registro y guard JWT. Cubren email/cédula, ceros iniciales, token manipulado/ausente/expirado/usado, cuentas inactivas/inexistentes, bcrypt, revocación, límites y errores/reintentos. No envían correos reales ni modifican cuentas externas.

La concurrencia real y la migración requieren PostgreSQL; Docker Desktop no estaba iniciado durante la implementación. Los tests unitarios verifican el uso de bloqueos y las transacciones, pero no reemplazan una prueba con dos conexiones reales. Tras autorizar la IP y reiniciar el backend, probar con una cuenta propia: solicitar enlace, revisar correo/spam, cambiar contraseña, intentar reutilizar enlace, verificar que la contraseña anterior y la sesión anterior ya no sirven.

## Privacidad del enlace

El frontend agrega política no-referrer al HTML inicial y a la pantalla. Configurar además Referrer-Policy: no-referrer desde el hosting. No guardar el token en localStorage, excluir esta ruta de analítica y redactar query strings sensibles en logs del proxy. La navegación tras éxito reemplaza la entrada del historial. El token solo se envía al backend en el cuerpo POST del cambio de contraseña.

### Segunda verificación del 6 de octubre de 2026

Tras autorizar la IP, `/account` y `/senders` responden HTTP 200 y la cuenta indica SMTP habilitado. Hay un remitente activo, pero su correo no coincide con BREVO_SENDER_EMAIL del .env. El templateId configurado es 123 y `/smtp/templates/123` devuelve HTTP 404. El listado de plantillas respondió HTTP 200 con un objeto vacío, sin plantillas visibles.

Actualizar BREVO_SENDER_EMAIL al correo verificado existente (o verificar el remitente deseado en Brevo), crear/activar una plantilla de recuperación con params.RESET_URL y guardar su ID real en BREVO_RESET_TEMPLATE_ID. No se modificó la cuenta ni se envió un correo de prueba mientras estos datos sean inválidos.

Las seis suites seleccionadas vuelven a pasar: 53 pruebas. No había backend escuchando en el puerto 3000 y Docker Desktop seguía sin iniciarse, por lo que no se probó el ciclo real sobre PostgreSQL ni la entrega de correo.

### Verificación con remitente y plantilla definitivos

La verificación remota pasa: cuenta, remitentes y plantilla HTTP 200; SMTP habilitado; correo configurado coincide con remitente activo; plantilla activa con params.RESET_URL y params.EXPIRES_MINUTES. Las seis suites seleccionadas pasan (53 pruebas).

Se agregó `scripts/check-password-recovery-db.cjs`: ejecuta el servicio real contra PostgreSQL con una cuenta temporal, todos los cambios dentro de una transacción externa revertida al terminar. La prueba pasó para bcrypt, rechazo de contraseña anterior, aumento de versión de sesión y rechazo de enlaces consumidos/revocados. Ejecutar desde backend después de compilar con `node scripts/check-password-recovery-db.cjs`.

Se envió un correo real al destinatario autorizado por el usuario usando BrevoMailService y la plantilla configurada. Brevo aceptó el envío. El token de ese correo es de demostración y no corresponde a ninguna cuenta; no sirve para cambiar contraseñas. La consulta inicial de eventos aún no mostraba confirmación de entrega. No había servidor HTTP escuchando en el puerto 3000, por lo que el ciclo completo de navegador/correo/reset sigue pendiente de una prueba manual con el backend y frontend iniciados.
