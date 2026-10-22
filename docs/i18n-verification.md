# Verificación de internacionalización — 22 de octubre de 2026

## Base configurada

Se aplicaron ProfileLanguage1792627200000 y CatalogI18n1792713600000 mediante TypeORM, en una transacción y con registro en migrations. No había otras migraciones pendientes. La segunda ejecución comprobó que no quedan pendientes.

Antes de aplicar se verificaron up/down e idempotencia sobre tablas temporales. Después se comprobaron contra PostgreSQL los tres roles × cuatro preferencias, conservación de identidad/roles, rechazo del idioma no admitido y creación/edición/lectura de JSON de catálogo. Las ocho entradas de servicios y cuatro tipos tienen código de traducción. Los fixtures se revirtieron.

## Ejecución reproducible

- Compilar: node node_modules/@nestjs/cli/bin/nest.js build
- Comprobar DB sin cambios persistentes: node scripts/check-i18n-db.cjs
- Aplicar migraciones pendientes en un destino autorizado y comprobar: node scripts/check-i18n-db.cjs --apply
- QA local: node scripts/preview-i18n.cjs; frontend con VITE_API_URL=http://127.0.0.1:3005. El script crea credenciales efímeras dentro de una transacción, deshabilita recuperación/correo/scheduler, escucha solamente en loopback y revierte al terminar (máximo 15 minutos). Nunca usar esas credenciales fuera del servidor QA.

El arranque productivo apunta ahora a dist/src/main.js, que es la salida real del build.

## Pruebas

Las 15 suites relevantes de idioma, perfil, recuperación, correo, catálogo, búsqueda, precios, localización, reservas, comentarios y guardados aprobaron 169 pruebas. Brevo fue simulado, sin envíos reales.

La ejecución global final: **34/49 suites aprobadas; 381 pruebas aprobadas, 24 fallidas**. Dos suites adicionales no ejecutaron sus casos por la configuración ESM de Jest. No se omitieron suites ni se cambiaron contratos de acceso para hacer pasar pruebas.

| Suite pendiente | Casos fallidos | Causa observada |
| --- | ---: | --- |
| auth/official-access.spec.ts | 1 | Expectativas de contratos anteriores (publicación/estado/actualización de propiedades). |
| messages/message-file/message-file.controller.spec.ts | 1 | Fixture sin proveedores/dependencias requeridos. |
| property/property-services.spec.ts | 11 | Fixture sin proveedores/dependencias requeridos. |
| user/user.controller.spec.ts | 1 | Fixture sin proveedores/dependencias requeridos. |
| property/public-property.spec.ts | 1 | Expectativas de contratos anteriores (publicación/estado/actualización de propiedades). |
| messages/conversation/conversation.controller.spec.ts | 1 | Fixture sin proveedores/dependencias requeridos. |
| role/role.controller.spec.ts | 1 | Fixture sin proveedores/dependencias requeridos. |
| messages/message/message.controller.spec.ts | 1 | Fixture sin proveedores/dependencias requeridos. |
| messages/message/message.service.spec.ts | 1 | Fixture sin proveedores/dependencias requeridos. |
| property/property-location.spec.ts | 2 | Expectativas de contratos anteriores (publicación/estado/actualización de propiedades). |
| messages/message-file/message-file.service.spec.ts | 1 | Fixture sin proveedores/dependencias requeridos. |
| user/user.service.spec.ts | 1 | Fixture sin proveedores/dependencias requeridos. |
| role/role.service.spec.ts | 1 | Fixture sin proveedores/dependencias requeridos. |
| auth/auth.service.spec.ts | 0 | Configuración Jest/ESM de @nestjs/jwt; la suite no llega a ejecutar casos. |
| auth/auth.controller.spec.ts | 0 | Configuración Jest/ESM de @nestjs/jwt; la suite no llega a ejecutar casos. |

Estos resultados impiden certificar la suite global. Los fallos de búsqueda y del contrato HTTP de servicios sí quedaron resueltos; los filtros rechazan serviceIds vacío y notación científica, y los tests usan el estado ACTIVE, paginación, dependencia UserService y ruta /service vigentes.

La base comprobada es la configurada en este checkout; esto no demuestra el estado de un destino de producción distinto.
