# Conversiones de moneda: implementación incremental

Cada etapa debe cerrar con una explicación de los archivos cambiados, su efecto,
la verificación realizada y lo que sigue. No se implementarán todas en un solo cambio.

## 1. Preparar la persistencia (completada)

- Preparar una migración reversible con lotes de tasas, tasas por moneda y registro de sincronizaciones.
- Mantener una sola actualización activa mediante un índice único parcial.
- Usar NUMERIC(30,15), rechazar tasas no positivas/no finitas y exigir USD = 1 cuando exista esa fila.
- En la primera entrega se dejó la migración preparada sin registrarla ni aplicarla.

Entrega: `src/migrations/1792454400000-currency-rates.ts`. El catálogo de países/monedas
habilitadas se agregará al implementar la preferencia del perfil.

## 2. Activar la persistencia y sincronizar manualmente (completada)

- Agregar un CurrencyModule con repositorio SQL coherente con la migración. Estas tablas
  se administran mediante SQL, sin entidades sincronizadas, para preservar índices
  parciales y restricciones del esquema en desarrollo y producción.
- Revisar la convivencia con DB_SYNCHRONIZE y registrar/aplicar la migración por el
  mecanismo correspondiente al entorno. Verificar up/down en una base de pruebas.
- Leer CURRENCY_API_KEY únicamente desde el backend. No usar variables VITE ni guardar la clave en Git.
- Implementar un cliente de /api/v2/rates con base USD y timeout.
- Validar valid, base, updated, monedas requeridas y tasas antes de escribir.
- Guardar y activar el lote completo en una transacción: desactivar el anterior y activar el nuevo.
- Rechazar actualizaciones más antiguas; no duplicar un lote si el proveedor devuelve el mismo dato.
- Registrar errores mediante códigos sanitizados, nunca con URLs que contengan key.
- Probar respuestas válidas, incompletas, inválidas y fallidas con datos simulados.
- Una carga manual controlada permitirá verificar el formato real sin activar aún el cron.

Implementación y uso: `docs/currency-synchronization.md`. Incluye endpoints administrativos,
comandos de mantenimiento y pruebas. El bloqueo transaccional y el intervalo mínimo de
60 segundos se adelantaron a esta etapa para proteger también las descargas manuales.
Ambas migraciones están aplicadas en la base configurada; la carga real guardó 166 tasas
en el lote activo 1. Pasan compilación, ESLint, 33 pruebas y la comprobación de PostgreSQL.

## 3. Automatizar la actualización (completada)

- Agregar @nestjs/schedule para ejecutar a las 00:00 en America/Costa_Rica.
- Usar un bloqueo compartido en PostgreSQL antes de la llamada externa para evitar
  solicitudes simultáneas entre instancias. El índice de lote activo no reemplaza ese bloqueo.
- Recuperar una ejecución omitida al iniciar solo si faltan tasas recientes, bajo el mismo bloqueo.
- Limitar reintentos con espera creciente para timeouts/errores temporales. No reintentar
  automáticamente credenciales inválidas o cuota mensual agotada.
- Conservar el último lote válido ante fallos y exponer el estado solo a administradores.
- Estimar 28–31 solicitudes mensuales sin reintentos; permitir configurar dos ejecuciones diarias después.

El cron diario y la recuperación al inicio/cada minuto usan la misma política bajo
bloqueo. Los reintentos se calculan con el historial persistido (máximo tres intentos
por día local, con esperas de 1 y 5 minutos), sin nuevas tablas. La configuración
CURRENCY_SYNC_ENABLED=false permite desactivar las ejecuciones automáticas.
Verificación: compilación y ESLint correctos, 62 pruebas pasan y comprobación real
de PostgreSQL completada en un esquema temporal eliminado al terminar. Esta etapa
no consumió solicitudes de CurrencyAPI ni modificó tasas existentes. Requiere
reiniciar el backend para activar el nuevo servicio y mantener el proceso ejecutándose.

## 4. Implementar conversiones locales (completada)

- CurrencyService calcula montoDestino = montoOrigen × tasaDestino / tasaOrigen.
- Utilizar aritmética decimal; conservar precisión interna y redondear al final por moneda.
- Leer ambas tasas del mismo lote. No llamar al proveedor al convertir.
- Devolver moneda original, destino, monto convertido y fecha de las tasas.
- Resolver moneda idéntica sin conversión. Si falta una tasa, mostrar el precio original.
- Marcar tasas mayores de 48 horas como desactualizadas.
- Verificar conversiones directas, inversas, cruzadas y redondeos.

CurrencyService usa decimal.js, lee ambas tasas del lote activo en una sola consulta
y está exportado para los módulos siguientes. Endpoint autenticado GET /currency/convert
y comando currency:convert disponibles. Contrato y manejo de fallos descritos en
docs/currency-conversions.md. No se modifican precios almacenados, perfiles o pantallas.
Verificado: compilación y ESLint correctos, 102 pruebas pasan y comprobación real
de PostgreSQL con lotes distintos, tasas ausentes y desactualizadas. Una conversión
de solo lectura con el lote real también fue correcta. No se consumieron solicitudes
de CurrencyAPI ni se modificaron las tasas existentes.

## 5. Agregar país y preferencia al perfil (completada)

- Agregar countryCode y preferredCurrency opcionales, con validación de catálogo.
- Resolver moneda: preferencia explícita → país del perfil → CRC.
- Agregar un catálogo local versionado de países y monedas habilitadas para alquileres.
- Excluir criptomonedas/metales del selector aunque existan tasas almacenadas.
- Actualizar GET/PATCH /auth/profile, DTOs, formulario y caché de perfil.
- Conservar la preferencia explícita al cambiar de país.

Implementado en Ajustes → Perfil y GET/PATCH /auth/profile, con catálogo autenticado
GET /auth/profile-options. Migración de dos columnas opcionales aplicada y verificada
con cuenta temporal revertida. 137 pruebas de perfil/monedas pasan; ambas aplicaciones
compilan. Contrato, fuente del catálogo y fallo previo detectado en la suite ampliada
documentados en docs/profile-currency.md. No se consumieron solicitudes de CurrencyAPI.

## 6. Integrar propiedades y filtros (completada)

- Mantener cost y typeOfCoin como precio original del propietario.
- Añadir el equivalente aproximado en listados, detalle y demás superficies de precios.
- Unificar el formato con Intl.NumberFormat e indicar la moneda y fecha de actualización.
- Distinguir la moneda de visualización del filtro de moneda original existente.
- Convertir filtros/rangos y ordenar por montos comparables antes de paginar en el backend.
- Verificar resultados mixtos CRC/USD, paginación y ausencia de tasas.
- Las conversiones son informativas. Cobros o contratos requieren guardar posteriormente
  el monto, moneda y tasa acordados por operación; no recalcular operaciones pasadas.

Integración y contrato descritos en docs/property-currency-display.md. Se verificaron
compilaciones de ambas aplicaciones, 159 pruebas y siete comprobaciones de formato.
PostgreSQL real comprobó filtros/orden/paginación sobre propiedades temporales, con
rollback completo. La interfaz se verificó con sesión y datos ficticios en CRC/USD/EUR,
incluyendo cambio de país/preferencia, presupuesto de portada y cierre de sesión.
No se modificaron precios publicados ni se consumieron solicitudes de CurrencyAPI.
Las seis etapas están implementadas; reiniciar backend y recargar frontend para usar
la integración completa. No se requieren migraciones nuevas respecto a la etapa 5.

## Condiciones de cierre

Navegar, cambiar moneda o filtrar no consume solicitudes de CurrencyAPI. Los fallos del
proveedor no borran tasas válidas ni alteran precios originales. No se exponen secretos.
Verificar las condiciones del plan de la cuenta antes del uso comercial.

Documentación: https://currencyapi.net/documentation/rates/
