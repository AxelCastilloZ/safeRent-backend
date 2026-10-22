# Tasas de cambio: sincronización manual y automática

SafeRent guarda tasas de CurrencyAPI en PostgreSQL mediante sincronización manual
y un cron diario. El servicio de conversiones locales está descrito en
`currency-conversions.md`; los cambios de perfil y pantallas siguen pendientes.

## Configuración y creación de tablas

Configurar CURRENCY_API_KEY únicamente en el `.env` del backend o en el entorno del
servidor. `.env.currency.example` contiene solo el nombre de la variable, sin secreto.
Nunca registrar la URL autenticada, respuestas de error del proveedor ni su stack.

Desde `safeRent-backend`:

```powershell
npm run build
npm run currency:prepare
npm run currency:sync
npm run currency:status
```

`prepare` aplica solamente las migraciones de monedas y preferencias del perfil y registra su ejecución en el
historial de TypeORM. No ejecuta otras migraciones pendientes ni sincroniza entidades.
`sync` solicita un lote; `status` solo consulta PostgreSQL y no consume cuota de API.
Los comandos no arrancan servidores HTTP ni trabajadores de correo. Recompilar tras
modificar el código para que los comandos usen la última versión.

En producción (`DB_SYNCHRONIZE=false`), AppModule registra y ejecuta la migración
mediante el flujo existente de TypeORM. En desarrollo, CurrencyRepository inicializa
el mismo esquema al arrancar, bajo bloqueo transaccional. La creación es idempotente,
por lo que pasar de desarrollo al flujo de migraciones no vuelve a crear las tablas.
No se agregan entidades que puedan modificar automáticamente sus índices parciales.

El arranque crea la estructura y comprueba si hace falta recuperar una actualización
diaria pendiente, según la política siguiente.

## Cron diario y recuperación

- `currency-daily-sync` ejecuta a las 00:00 en `America/Costa_Rica`, independientemente
  de la zona horaria del servidor. Usa `@nestjs/schedule` 6, compatible con NestJS 11
  y las pruebas CommonJS del proyecto.
- `CURRENCY_SYNC_ENABLED=true` es el valor predeterminado. Configurar `false` desactiva
  las comprobaciones automáticas; la sincronización manual sigue disponible.
- Sin CURRENCY_API_KEY no se hacen comprobaciones automáticas ni llamadas al proveedor.
- Al arrancar y cada minuto, se consulta PostgreSQL bajo el mismo bloqueo de sincronización.
  La API solo se llama si hay trabajo pendiente. Los ticks sin trabajo no generan logs.
- Si hubo una descarga exitosa o una respuesta sin cambios desde la medianoche local,
  y las tasas tienen como máximo 48 horas, no se vuelve a consultar al proveedor ese día.
- Si el servidor estaba apagado, al arrancar recupera una actualización para el día
  actual. No descarga por separado todos los días perdidos. También recupera una
  ejecución omitida si el proceso estuvo suspendido y luego vuelve a recibir ticks.
- Hay un máximo de tres intentos diarios (uno inicial y dos reintentos). Las ejecuciones
  manuales también cuentan para este presupuesto automático, pero un administrador
  puede solicitar una recuperación manual explícita después de corregir un problema.
- Ante fallos de red/timeout, HTTP 408/429/5xx o error 500 del proveedor, los dos reintentos
  esperan al menos 1 y 5 minutos desde el fin del intento anterior. Se ejecutan en el
  siguiente tick disponible; no se mantienen transacciones abiertas durante la espera.
- Clave inválida, cuota mensual agotada (código 405 del proveedor), permisos, respuestas
  inválidas y errores de persistencia detienen los intentos automáticos por el resto
  del día. Se distingue el código del proveedor del estado HTTP, incluso si la cuota
  se entrega con HTTP 429. Los mensajes del proveedor nunca se publican ni registran.
- El estado de intentos/errores se consulta del historial existente en PostgreSQL.
  Reiniciar o agregar instancias no reinicia el presupuesto ni la espera. Cada nuevo
  día habilita un ciclo nuevo; si persiste el problema definitivo, se detiene tras su
  primer fallo. No se necesitan migraciones adicionales para esta etapa.
- Durante una descarga se usa el timeout de 10 segundos y el bloqueo transaccional
  existente. En el apagado se espera a terminar la ejecución activa.

Para activar el cambio, recompilar y reiniciar el backend. El proceso debe permanecer
ejecutándose para disparar el cron; el código no instala un servicio del sistema operativo.
El consumo normal es 28–31 solicitudes al mes, más recuperaciones/reintentos necesarios
y sincronizaciones manuales. `GET /currency/status` permite revisar el último resultado
como administrador; los fallos automáticos también registran solo su código sanitizado.

## Endpoints

Ambos requieren JWT y rol ADMIN mediante los guards globales existentes:

- `POST /currency/sync`: inicia una descarga manual; devuelve estado y batchId si procede.
- `GET /currency/status`: devuelve activeBatch y lastRun, o null cuando no existen.

Ejemplo de respuesta al sincronizar:

```json
{ "status": "succeeded", "batchId": 1 }
```

Otra ejecución simultánea devuelve skipped/CURRENCY_SYNC_IN_PROGRESS sin llamar a
CurrencyAPI. Una petición dentro de los 60 segundos de la última ejecución devuelve
skipped/CURRENCY_SYNC_COOLDOWN. Consultar el estado no tiene ese intervalo mínimo.
Las respuestas iguales o antiguas devuelven skipped; lastRun.errorCode distingue
CURRENCY_UNCHANGED y CURRENCY_OUTDATED_RESPONSE.

Un fallo devuelve HTTP 503 con un código controlado. El registro conserva únicamente
ese código: CURRENCY_NOT_CONFIGURED, CURRENCY_REQUEST_FAILED,
CURRENCY_INVALID_RESPONSE, CURRENCY_HTTP_<estado>, CURRENCY_PROVIDER_<código>
o CURRENCY_STORAGE_FAILED. Las peticiones manuales no se reintentan automáticamente.

## Validación y persistencia

- Endpoint fijo HTTPS `/api/v2/rates`, base USD, salida JSON y timeout de 10 segundos.
- Redirecciones rechazadas; nunca se utiliza una URL aportada por el cliente.
- Exigir valid=true, base=USD y updated como timestamp Unix en segundos, positivo,
  entero y no más de cinco minutos en el futuro.
- Validar códigos de 3–10 caracteres alfanuméricos mayúsculos, comenzando con letra,
  y tasas numéricas finitas, positivas,
  representables por NUMERIC(30,15). CRC es obligatoria en esta etapa.
- Si falta USD, agregar la identidad USD=1; rechazar un USD explícito distinto de 1.
- Conservar todas las tasas válidas recibidas. Habilitar monedas de alquiler será
  una decisión del catálogo del perfil, no del proveedor.
- Rechazar respuestas anteriores al último lote y evitar duplicados por proveedor,
  base y fecha del proveedor.
- El bloqueo advisory transaccional se obtiene antes de consumir API. Funciona entre
  conexiones e instancias, también con pooling transaccional de PostgreSQL.
- Una transacción inserta todas las tasas y cambia el lote activo. Los lectores ven
  un lote completo; un error revierte esa actualización y conserva el lote anterior.
- La ejecución fallida se registra fuera del savepoint de persistencia, conservando
  el error controlado. Si falla la base de datos misma no se garantiza guardar auditoría.
- activeBatch incluye currencyCount, fechas y stale=true al superar 48 horas desde
  la fecha del proveedor. Esa marca es informativa; no borra tasas.

## Verificación

```powershell
npm run build
npm test -- --runInBand currency
npm exec -- eslint src/currency src/migrations/1792454400000-currency-rates.ts src/migrations/1792454400001-currency-provider-codes.ts
npm run currency:check-db
```

Las pruebas unitarias y HTTP usan datos simulados y no consumen solicitudes reales.
La comprobación PostgreSQL crea un esquema temporal aleatorio y lo elimina al final;
verifica up/down, restricciones, bloqueos entre conexiones, cooldown, duplicados,
respuestas antiguas, reemplazo atómico, conservación de tasas ante fallos, recuperación
desde medianoche de Costa Rica y límites/reintentos persistidos. Requiere
conexión a la base configurada y permiso para crear un esquema temporal.

Las conversiones locales ya están disponibles mediante CurrencyService y
`GET /currency/convert`. Después se implementarán la preferencia del perfil y
la visualización de precios.

Referencia del contrato: https://currencyapi.net/documentation/rates/

La respuesta real incluye símbolos de cuatro letras (DOGE, LINK, USDC, USDT).
`1792454400001-currency-provider-codes.ts` amplía el campo de la primera migración,
que ya estaba aplicada al detectar esa diferencia. Su rollback rechaza reducir
el campo si hay símbolos largos almacenados, para evitar truncar o perder datos.

## Resultado de la etapa 2 (20 de octubre de 2026)

- Compilación y ESLint de los archivos TypeScript nuevos correctos; 33 pruebas pasan.
- Verificación real de PostgreSQL completada; el esquema temporal se eliminó al terminar.
- Las dos migraciones de monedas están aplicadas en la base configurada.
- Descarga real completada: lote activo 1 con 166 tasas; estado succeeded y stale=false.
- Se utilizaron tres solicitudes al proveedor: primer intento rechazado por los códigos
  largos, diagnóstico del formato y descarga final correcta.
- La clave está configurada únicamente en el `.env` local ignorado por Git.
- No se activó un cron ni se modificaron precios o perfiles. Reiniciar el backend
  cuando corresponda para cargar el módulo y los endpoints nuevos.

## Resultado de la etapa 3 (20 de octubre de 2026)

- Cron diario, recuperación automática y reintentos persistidos implementados.
- Compilación y ESLint correctos; 62 pruebas pasan, incluyendo registro/ejecución
  simulada del cron y su próxima medianoche en horario de Costa Rica.
- PostgreSQL real verificó recuperación diaria, descarte de comprobaciones redundantes,
  espera entre reintentos, rechazo de cuota agotada y presupuesto diario persistido.
- El esquema temporal se eliminó; no se modificaron tasas existentes ni se hicieron
  solicitudes a CurrencyAPI durante esta etapa.
- package-lock.json y pnpm-lock.yaml incluyen @nestjs/schedule 6.1.3.
- No se inició ni reinició el servidor desde estas comprobaciones. El servicio se
  activa al reiniciar el backend con la configuración predeterminada.
