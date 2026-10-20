# Conversiones locales de moneda

CurrencyService está exportado por CurrencyModule para que los módulos de propiedades
y perfil lo utilicen en etapas posteriores. No depende de CurrencyApiClient ni de la
sincronización: convertir no hace llamadas externas, actualiza tasas ni modifica precios.

## Endpoint autenticado

`GET /currency/convert?amount=250000.00&from=CRC&to=USD`

Requiere JWT y permite roles ADMIN, CLIENT y OWNER. Los endpoints de sincronización
y estado continúan restringidos a ADMIN. El endpoint utiliza el ValidationPipe global.

- amount es texto decimal no negativo, con hasta 15 dígitos enteros y 6 decimales.
  Acepta cero. Rechaza separadores de miles, notación científica y signos.
- from/to son códigos monetarios; se normalizan espacios exteriores y mayúsculas.
- Solo se admiten monedas reconocidas por Intl del runtime; se excluyen metales y
  unidades especiales XAU/XAG/XPD/XPT/XTS/XXX/XDR/XSU/XUA. Los símbolos de criptoactivos
  almacenados por el proveedor no se ofrecen para alquileres. El catálogo de países
  y monedas habilitadas del perfil se completará en la siguiente etapa.
- No se aceptan tasas aportadas por el cliente. El whitelist descarta otros campos.

Ejemplo orientativo (la cifra depende del lote guardado):

```json
{
  "status": "converted",
  "original": { "amount": "250000.00", "currency": "CRC" },
  "targetCurrency": "USD",
  "converted": { "amount": "500.00", "currency": "USD" },
  "rate": "0.002",
  "batchId": 1,
  "ratesUpdatedAt": "2026-10-20T06:00:00.000Z",
  "stale": false,
  "approximate": true,
  "reason": null
}
```

## Cálculo y precisión

El repositorio obtiene ambas tasas con un único SELECT, unidas por el identificador
del lote activo. Los valores NUMERIC se leen explícitamente como texto.

`montoDestino = montoOrigen × tasaDestinoUSD / tasaOrigenUSD`

decimal.js usa una configuración aislada de 100 dígitos significativos. Se multiplica
y divide con las tasas originales; solo se redondea el monto final, con ROUND_HALF_UP
y los decimales de la moneda destino obtenidos de Intl (por ejemplo, JPY: 0, CRC/USD: 2,
KWD: 3). El cociente rate es informativo y se presenta con hasta 30 dígitos significativos;
no se reutiliza esa versión abreviada para calcular el monto.

Los importes y el cociente viajan como strings JSON para conservar precisión.
`original` conserva el monto recibido. Si origen y destino coinciden, status es
unchanged, rate es 1 y se devuelve exactamente el monto original, sin leer PostgreSQL
ni redondearlo. En ese caso no hay lote ni fecha de tasas porque no se usó una conversión.

## Ausencia de tasas y fallos

Si no hay lote activo, falta una tasa o falla su lectura, status es unavailable,
converted es null y original sigue disponible para mostrar el precio publicado.
reason distingue CURRENCY_RATES_UNAVAILABLE, CURRENCY_RATE_MISSING,
CURRENCY_STORAGE_UNAVAILABLE y CURRENCY_INVALID_STORED_RATE.

Una tasa válida con más de 48 horas sigue permitiendo una conversión aproximada,
pero se devuelve stale=true junto con la fecha original de las tasas. No se solicita
una actualización como efecto de convertir.

Las monedas/montos inválidos devuelven HTTP 400. Esta funcionalidad es informativa;
los futuros cobros/contratos deben guardar monto, moneda y tasa acordados por operación.

## Uso y verificación

Desde el backend, después de compilar:

```powershell
npm run currency:convert -- 250000 CRC USD
```

Este comando solo lee PostgreSQL. No inicia el cron ni otros trabajadores.

```powershell
npm run build
npm test -- --runInBand currency
npm exec -- eslint src/currency
npm run currency:check-db
```

Las pruebas cubren precisión decimal, redondeo por moneda, importes grandes, tasa
idéntica, ausencia de datos, errores, acceso autenticado y rechazo de consultas inválidas.
La comprobación PostgreSQL usa un esquema temporal para verificar que un lote antiguo
no aporte una tasa ausente en el lote activo y que las tasas desactualizadas se marquen.

La etapa 4 no agregó migraciones ni modificó perfiles o pantallas. Las etapas 5 y 6
ya integran país/moneda del perfil y precios/filtros; ver profile-currency.md y
property-currency-display.md. Reiniciar el backend para cargar todos los endpoints.

Referencia de decimal.js: https://mikemcl.github.io/decimal.js/

## Resultado de la etapa 4 (20 de octubre de 2026)

Compilación y ESLint correctos; 102 pruebas pasan. PostgreSQL real verificó lecturas
del mismo lote y manejo de tasas ausentes/desactualizadas, dentro de un esquema temporal
que se eliminó al terminar. La conversión de solo lectura con el lote real 1 devolvió
250000 CRC → 550.02 USD, con tasas del 20 de octubre de 2026 a las 18:00:54 UTC,
marcadas como vigentes en esa comprobación. Es una referencia del lote utilizado,
no una cotización permanente. No se consultó CurrencyAPI en esta etapa.
