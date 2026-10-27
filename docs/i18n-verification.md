# Verificación de internacionalización — 22 de octubre de 2026

## Resultado actual

- **49/49 suites y 411/411 pruebas del backend aprobadas**, sin omisiones. Resumen reproducible: [i18n-jest-checks.json](i18n-jest-checks.json).
- **216 solicitudes HTTP verificadas contra PostgreSQL**, 54 por cada idioma es/en/fr/pt, con JWT y guards reales. Resultado: [i18n-flow-checks.json](i18n-flow-checks.json).
- Se conservaron todos los casos anteriores. Los tests básicos de controladores usan servicios simulados y los de servicios inyectan sus repositorios/dependencias. Los tests unitarios de login aíslan JwtService; la matriz HTTP comprueba el JWT real.
- Se añadieron casos de contraseña incorrecta, cuentas ausentes/inactivas y claims de identidad/versión de sesión. Las pruebas de publicación comprueban DRAFT → PENDING, aprobación administrativa y que el DTO HTTP elimina inyecciones de estado/propietario. No se modificaron los guards para hacer pasar expectativas antiguas.

## Flujos comprobados en los cuatro idiomas

La matriz inicia sesión con CLIENT, OWNER y ADMIN, guarda y consulta preferencias conservando identidad y roles, y prueba validación estructurada, errores y accesos denegados. Recorre creación de borrador, ausencia de imágenes, intento de inyección de propietario/estado, envío a revisión, solicitud de cambios, reenvío y aprobación. Comprueba detalle público seguro, rechazo de edición ajena, creación idempotente de conversaciones, identidad del remitente, lectura de mensajes y accesos a conversaciones directas.

También comprueba descarga privada de un adjunto ficticio byte a byte, rechazo a terceros y al destinatario que intenta modificar el adjunto, y rechazo de un MIME no permitido. Recorre reserva y liberación, consulta del inquilino, guardado y eliminación del favorito, comentario único, ocultación/restauración administrativa y conservación de contenido Unicode escrito por usuarios.

Los cambios están contenidos en una transacción externa. No se envían mensajes a cuentas reales ni correos; recuperación/Brevo y scheduler de monedas se sustituyen durante QA. Se elimina únicamente el PNG temporal creado por esta ejecución. El servidor se limita a 127.0.0.1:3005 y drena las solicitudes antes de revertir y cerrar. Los resultados no certifican correo real, proveedores externos o un despliegue distinto.

## Diferencia de esquema detectada y reparada

Las migraciones ProfileLanguage1792627200000 y CatalogI18n1792713600000 seguían registradas, pero sus cinco columnas estaban ausentes al comenzar esta revisión. Se reaplicaron explícitamente las dos migraciones idempotentes, en una transacción, mediante check-i18n-db.cjs --repair. Se conservaron el historial y los nombres de catálogo. Volvieron a pasar la persistencia de preferencias para tres roles × cuatro idiomas, catálogos JSON y restricción de idioma. Las ocho entradas de servicios y cuatro tipos tienen sus códigos.

El comprobador ahora contrasta el esquema real con el historial; que no haya migraciones pendientes ya no basta para aprobarlo. La ausencia observada es compatible con sincronización desde una versión anterior, pero no se ha identificado el proceso que la causó. Antes de desplegar, detener instancias antiguas que compartan la base y configurar **DB_SYNCHRONIZE=false**. Una migración registrada no protege contra cambios posteriores de esquema.

Al finalizar se confirmaron cero cuentas, propiedades y mensajes ficticios persistidos, cero archivos PNG de QA restantes y las cinco columnas presentes. El cierre ordenado de la vista poblada también se ejecutó y terminó correctamente.

## Comandos

- Compilar: node node_modules/@nestjs/cli/bin/nest.js build
- Pruebas completas: node node_modules/jest/bin/jest.js --runInBand
- Preflight de esquema y persistencia reversible: node scripts/check-i18n-db.cjs
- Aplicar migraciones en un destino autorizado: node scripts/check-i18n-db.cjs --apply
- Reparar una diferencia ya investigada/autorizada: node scripts/check-i18n-db.cjs --repair (no se ejecuta automáticamente).
- Matriz HTTP reversible: node scripts/preview-i18n.cjs --check
- Vista poblada: node scripts/preview-i18n.cjs --fixtures; frontend con VITE_API_URL=http://127.0.0.1:3005. Para cerrar de forma ordenada, escribir stop y pulsar Enter. Límite automático: 15 minutos. Las credenciales impresas solo sirven para ese servidor QA y desaparecen al revertir.

El arranque de producción usa dist/src/main.js. Los comandos de QA también están disponibles como i18n:check-db, i18n:check-flows e i18n:preview en package.json.

## Pendiente externo a estas pruebas

Revisión editorial del grupo, dispositivos iOS/Android físicos y comprobaciones sobre el servidor/base de producción efectivos. La matriz HTTP y el navegador adaptable cubren los escenarios documentados; no constituyen una certificación visual de toda combinación posible de datos.
