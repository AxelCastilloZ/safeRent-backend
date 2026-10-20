# Precios según la moneda del perfil

La integración usa la moneda calculada en el perfil para explorar, destacados,
detalle público, guardados, reservas y consultas del propietario. Los visitantes
sin sesión usan CRC. Los campos cost/typeOfCoin siguen siendo el precio publicado;
el propietario continúa editando esos valores originales.

## Flujo de visualización

- useDisplayCurrency consulta la caché del perfil y espera su carga cuando hay sesión.
- El frontend envía displayCurrency al backend. Los endpoints públicos conservan su
  acceso anónimo y usan CRC por defecto si el consumidor no indica una moneda.
- PropertyPricingService obtiene un único lote local para cada respuesta y agrega
  displayPrice, con el contrato del conversor, sin consultas individuales por propiedad.
- El precio principal usa la moneda de visualización; una conversión se marca con ≈.
  Debajo se conserva el precio original y la fecha de las tasas en horario de Costa Rica.
- Las tasas mayores de 48 horas llevan el aviso “Tasas desactualizadas”. Si no existe
  conversión, se muestra el precio original y se informa que la conversión no está disponible.
- Los marcadores del mapa usan el mismo importe. El formato conserva las fracciones
  monetarias y utiliza BigInt para presentar strings decimales sin perder centavos.
- Al guardar una preferencia, las cachés de perfil se invalidan como antes; el cambio
  de moneda modifica las claves de las consultas y recarga los precios. Al cerrar
  sesión se vuelve a CRC, sin reutilizar el contexto monetario de otra cuenta.
- La búsqueda de portada ahora permite un presupuesto máximo en la moneda del perfil.
  Ya no fuerza USD ni limita implícitamente a publicaciones originalmente en dólares.
- apiAxios respeta VITE_API_URL y, sin configuración explícita, usa /api con el proxy
  de Vite, igual que el explorador.

## Filtros y orden antes de paginar

GET /properties y GET /properties/active admiten:

| Parámetro | Significado |
| --- | --- |
| displayCurrency | Moneda en que se muestran y comparan los precios; CRC por defecto. |
| minPrice / maxPrice | Rango en displayCurrency; números finitos no negativos, hasta seis decimales. |
| sourceCurrency | Filtro independiente por la moneda original de publicación. |
| sort | newest, price_asc o price_desc. |
| rateBatchId | Lote fijado para mantener tasas entre páginas; 0 fija el estado sin tasas. |

Se rechazan monedas fuera del catálogo, orden desconocido, lotes negativos/inexistentes
y rangos cuyo mínimo excede el máximo. Los filtros anteriores de servicios, ubicación,
habitaciones y tipo de propiedad se conservan.

El query builder une la tasa de origen al identificador del lote preparado y usa la
tasa de destino del mismo snapshot. Calcula el equivalente con NUMERIC y redondea según
los decimales de destino, de modo que los límites coincidan con el precio mostrado.
El cálculo conserva escala adicional antes de dividir; no utiliza una tasa cruzada
previamente redondeada. Los filtros y el orden se aplican antes de skip/take y del conteo.
Los empates de precio se resuelven por id descendente y los precios no comparables
quedan al final al ordenar, tanto ascendente como descendente.

Ejemplo con tasas ficticias USD=1, CRC=500, EUR=0.8: las publicaciones CRC 250000,
USD 500 y EUR 400 cumplen un rango de CRC 250000–250000. Con limit=1 deben resultar
tres páginas y total=3, no un filtrado posterior sobre la primera página.

Las respuestas paginadas agregan priceContext con moneda, batchId, fecha y stale.
El frontend fija ese batchId en las páginas siguientes, aunque el cron active un lote
nuevo entre solicitudes. Si la primera página carece de tasas, fija rateBatchId=0
para no mezclar importes sin convertir con un lote que aparezca más tarde.

Sin tasas, los rangos solo incluyen precios comparables (por ejemplo, publicaciones
en la misma moneda destino). Sin rango, las propiedades siguen visibles con su precio
original. El formulario explica esa limitación para que el usuario interprete los resultados.

## Verificación de la etapa 6

- Ambas aplicaciones compilan. ESLint pasa en los módulos de monedas/precios nuevos,
  el DTO de búsqueda y los archivos frontend revisados.
- 159 pruebas de monedas, perfil, integración de precios y consultas públicas pasan.
- Siete comprobaciones de formato verifican decimales por moneda, ROUND_HALF_UP e
  importes grandes conservados exactamente.
- PostgreSQL real verificó rangos mixtos CRC/USD/EUR, orden antes de paginar, conteo,
  moneda de origen, redondeo de límites, precios faltantes y lote histórico fijado.
  Se usaron tablas temporales que sombrean las reales en una única conexión; al
  terminar se revirtió toda la transacción. No se modificaron propiedades ni tasas existentes.
- Comprobación en navegador con API/sesión ficticias aisladas: visitante en CRC,
  preferencia explícita USD y cambio a España/automática EUR desde Ajustes. Listados
  y destacados reflejaron la moneda; al cerrar sesión volvieron a CRC.
- Se verificó también un presupuesto de portada en EUR sin filtro implícito de
  publicación USD. Los controles de moneda publicada y presupuesto funcionaron por separado.
- La captura property-currency-preview.png muestra datos ficticios de esa comprobación.
- No se hicieron solicitudes a CurrencyAPI durante esta etapa. No se agregan migraciones.

Comandos desde el backend:

```powershell
npm run build
npm test -- --runInBand currency profile property-pricing public-landing
node scripts/check-property-pricing-db.cjs
```

Desde el frontend:

```powershell
npm run build
node --experimental-strip-types scripts/check-money-format.mjs
```

Reiniciar el backend y recargar el frontend para cargar la integración. El cron diario
requiere que el backend permanezca ejecutándose, tal como se indicó en la etapa 3.
Las cotizaciones son informativas: un cobro/contrato futuro debe guardar su monto,
moneda y tasa acordados, sin recalcular operaciones pasadas.
