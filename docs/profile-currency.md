# País y moneda del perfil

La página Ajustes → Perfil permite indicar país/territorio y una moneda preferida.
La selección automática usa el país guardado en el perfil, sin geolocalización ni
inferencias por dirección IP, teléfono o zona horaria.

## Resolución

1. Una preferredCurrency explícita válida tiene prioridad.
2. En modo automático (preferredCurrency=null), se usa la moneda del countryCode.
3. Sin país o sin moneda admitida para ese territorio se usa CRC.

Ejemplos: CR → CRC, US → USD, ES → EUR, JP → JPY. Un perfil de España con preferencia
USD conserva USD aunque cambie de país. Seleccionar “Automática según el país” envía
preferredCurrency=null y vuelve a calcular la moneda. Borrar el país conserva una
preferencia explícita; si también se borra esta, el resultado es CRC.

## Contrato autenticado

GET /auth/profile devuelve los campos existentes y:

```json
{
  "countryCode": "ES",
  "preferredCurrency": null,
  "resolvedCurrency": "EUR",
  "currencySource": "country"
}
```

currencySource puede ser preference, country o default. Estos dos campos derivados
se calculan en el servidor, no se almacenan ni aceptan desde el formulario.

PATCH /auth/profile mantiene el contrato anterior de campos personales completos y
admite countryCode y preferredCurrency opcionales. Omitir uno conserva su valor;
enviar null lo borra. Los strings se normalizan a mayúsculas y deben pertenecer al
catálogo. Se rechazan códigos inventados, arrays, criptomonedas, metales y unidades
especiales. Las comprobaciones de identidad y seguridad existentes se conservan.

GET /auth/profile-options requiere autenticación y devuelve countries, currencies
y defaultCurrency. Cada país incluye su moneda automática efectiva. El frontend usa
este catálogo para ambos selectores y para la previsualización de la moneda del perfil.
Al guardar se invalidan las cachés de perfil/sesión existentes.

## Catálogo y persistencia

- country-currencies.ts es un snapshot local de 257 países y territorios, generado
  desde Unicode CLDR JSON 48.2.0 para el 20 de octubre de 2026.
- Se elige la primera moneda de curso legal vigente indicada por CLDR cuando existen
  varias. La preferencia explícita permite cambiar esa elección.
- Las monedas habilitadas son las monedas actuales del catálogo reconocidas por el
  runtime, excluyendo los activos/unidades que el conversor no admite para alquileres.
- Los nombres en español provienen de Intl.DisplayNames local. No se consulta a
  CurrencyAPI ni a CLDR durante la navegación o al actualizar el perfil.
- scripts/update-country-catalog.cjs permite regenerar deliberadamente el snapshot
  desde la versión fija, conservando atribución y docs/unicode-cldr-LICENSE.txt.
- La migración ProfileCurrency1792454400002 agrega countryCode varchar(2) y
  preferredCurrency varchar(3), ambos nullable, en user. No rellena datos de cuentas.
- Las cuentas existentes y nuevas sin preferencias devuelven null/null y CRC.
- En desarrollo los campos forman parte de las entidades sincronizadas. En producción
  la migración se ejecuta por el mecanismo habitual. currency:prepare también incluye
  esta migración, junto con las de monedas, sin ejecutar otras migraciones pendientes.

Que una moneda sea elegible no garantiza que exista una tasa en todos los lotes del
proveedor. El conversor mantiene su manejo de tasa faltante y conserva el precio original.

## Verificación de esta etapa

- Compilaciones de frontend y backend correctas; ESLint de los archivos verificados correcto.
- 137 pruebas de perfil/monedas pasan.
- Suite ampliada de autenticación: 167 pruebas pasan y una falla por una inconsistencia
  anterior en official-access.spec.ts: espera 401 en /properties/active/:id, pero esa ruta
  ya está marcada @Public() en HEAD. No se modificaron esa ruta ni sus guards.
- check-profile-currency-migration.cjs verificó up/down e idempotencia sobre una tabla
  temporal que sombrea user únicamente en su transacción. Todos los cambios se revirtieron.
- La migración nueva está aplicada a la base configurada.
- check-profile-db.cjs verificó persistencia de país/preferencia, conservación al cambiar
  de país, retorno a automático y CRC, junto con controles de correo/contraseña/sesiones.
  La cuenta temporal y todos sus cambios se revirtieron.
- No se hicieron solicitudes a CurrencyAPI ni se cambiaron preferencias de cuentas existentes.

Reiniciar el backend para cargar el endpoint y el nuevo esquema de perfil. La etapa 6
ya conecta las preferencias con listados, detalle y filtros; ver property-currency-display.md.

Fuentes: https://github.com/unicode-org/cldr-json/tree/48.2.0 y licencia local indicada.
