# Paneles y permisos oficiales

El selector «Mis paneles» muestra únicamente los roles activos que devuelve /auth/me.
No cambia los roles de una cuenta. Para asignar o retirar un rol se usa la gestión de
usuarios del administrador. El login vuelve a la ruta solicitada o al panel principal
(ADMIN, OWNER, CLIENT, en ese orden). Las rutas vuelven a comprobar la sesión y los roles.

Registro: accountType admite CLIENT u OWNER, con CLIENT por defecto. ADMIN no puede
solicitarse en el registro público. Publicar requiere OWNER; ya no es una forma de obtener
un rol que la cuenta no tenía.

## Frontend
- /dashboard y sus rutas de inquilino: CLIENT.
- /dashboard/owner: OWNER.
- /dashboard/admin y /admin/services: ADMIN.
- /properties: OWNER o ADMIN; el botón de creación requiere OWNER en el backend.
- /property_detail/:id: sesión. El catálogo sigue siendo público.
- Una cuenta con varios roles puede cambiar entre sus áreas.

## Backend
JWT comprueba en cada petición que la cuenta siga activa y carga sus roles activos.
RolesGuard verifica el rol y ResourceAccessGuard verifica el recurso antes de procesar
la petición, incluidas las cargas de archivos.

- Usuarios y gestión de roles: ADMIN. Los roles principales no pueden renombrarse,
desactivarse o eliminarse.
- Servicios: listado público; creación, actualización y eliminación ADMIN.
- Propiedades: catálogo y tipos públicos; detalle público requiere sesión.
Creación y envío a revisión OWNER; edición y archivos OWNER o ADMIN.
El propietario solo accede a sus propiedades y listado; ADMIN puede gestionarlas.
La edición no permite transferir ownerId.
- Conversaciones: creación CLIENT, participantes derivados de sesión + propietario.
Lectura y mensajes CLIENT u OWNER, únicamente participantes. Cada bandeja es privada.
- Mensajes: senderId se obtiene de la sesión. Adjuntos: lectura por participantes,
modificación solo remitente. Descarga autenticada en /messages/:id/files/:fileId/download.
El servidor público /uploads solo sirve archivos registrados como fotos de propiedades.
- Reservas: OWNER y propietario/participante del chat; se conserva la relación existente.
- Comentarios: creación CLIENT y además inquilino vinculado; listado visible público.
Moderación y listado administrativo ADMIN.
- Eliminar un usuario desactiva la cuenta y conserva sus relaciones e historial.

## Verificación
official-access.spec.ts comprueba accesos públicos, roles, propiedad de recursos,
participación, adjuntos e identidad del remitente. Las suites de comentarios, moderación
y reservas comprueban sus permisos particulares.
scripts/check-role-access.ts verifica el arranque y los permisos con cuentas y JWT reales,
sin sincronizar el esquema ni modificar datos. Puede ejecutarse con:
node -r ts-node/register -r tsconfig-paths/register scripts/check-role-access.ts

La suite antigua del proyecto contiene fallos de mocks/proveedores y expectativas del
flujo anterior; estos no se consideran una verificación válida del nuevo control de acceso.
