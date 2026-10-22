# Fotografías de propiedades en Dropbox

Dropbox se utiliza únicamente para las fotografías de propiedades. Se adapta la estrategia de San Pablo: carga desde el backend, carpetas por recurso, metadatos y ruta de Dropbox en PostgreSQL y renovación automática mediante refresh token. El cliente nunca recibe credenciales de Dropbox. Se usa la API HTTP oficial con `fetch`, sin una dependencia adicional.

## Conectar la cuenta de SafeRent

1. Iniciar sesión con el correo de SafeRent en https://www.dropbox.com/developers/apps y crear una aplicación Scoped access con acceso App folder. El correo por sí solo no autoriza la integración.
2. En Permissions habilitar `files.metadata.read`, `files.metadata.write`, `files.content.write`, `files.content.read`, `sharing.read` y `sharing.write`. Guardar los cambios antes de autorizar.
3. Registrar exactamente `http://localhost:53682/dropbox/callback` en OAuth 2 Redirect URIs.
4. Copiar las variables de `.env.dropbox.example` al `.env` del backend y completar App key y App secret desde App Console.
5. Desde el backend ejecutar `npm run dropbox:connect`. Abrir el enlace que imprime, verificar que se usa la cuenta de SafeRent y aprobar el acceso. El script local comprueba state y PKCE, escribe el refresh token en `.env` y no lo muestra en el navegador ni en la consola.
6. Reiniciar el backend. El `.env` permanece fuera de Git. No colocar estas variables en `VITE_*` ni en el frontend.

Con App folder, las rutas siguientes están dentro de `Apps/<nombre de la aplicación>` de la cuenta Dropbox:

```text
/SafeRent/Propiedades/<nombre-de-la-propiedad>-<id>/Fotos/<uuid>.jpg
```

`DROPBOX_ROOT_FOLDER` cambia la carpeta base. Los nombres UUID evitan conflictos y rutas proporcionadas por el usuario. El nombre original queda en la base de datos.

Las carpetas de propiedades usan el título normalizado y su identificador, por ejemplo `casa-en-san-jose-28`, para distinguir títulos repetidos. Si cambia el nombre, las nuevas cargas usan el nuevo nombre; los archivos anteriores conservan su ruta y siguen disponibles.

Para actualizar carpetas existentes: compilar con `npm run build`, revisar la vista previa de `npm run dropbox:rename-folders` y aplicar con `npm run dropbox:rename-folders -- --apply`. Este comando mueve únicamente las carpetas de propiedades en Dropbox y actualiza las rutas en PostgreSQL dentro de una transacción. Conserva los enlaces compartidos. Verifica todos los destinos antes de mover, rechaza destinos existentes y, si falla, intenta revertir los movimientos ya realizados. Ejecutarlo durante una pausa de cargas de archivos. Se puede ejecutar otra vez sin modificar las carpetas que ya tienen el nombre esperado.

## Uso y acceso

- Propiedades: los endpoints existentes `POST/GET /properties/:id/files` y `DELETE /properties/:id/files/:fileId` conservan sus controles de propietario/administrador. Hasta 10 archivos por solicitud y 10 MB por archivo; JPG, PNG y WebP. La interfaz de publicación sigue seleccionando fotografías.
- Fotos de propiedades: se crean enlaces compartidos para visualizarlas, igual que en San Pablo. Cualquier persona con ese enlace puede ver el archivo. No usar este flujo para documentos privados.

Los archivos nuevos usan `storage=dropbox`; los existentes mantienen `storage=local` y continúan funcionando sin migrar ni borrar el disco. La desactivación de una propiedad conserva sus fotografías. El borrado de un archivo elimina primero Dropbox y luego sus metadatos; si falla Dropbox se conserva la referencia para reintentar. Si falla la carga o la persistencia se intenta limpiar lo que ya se subió.

## Base de datos y comprobación

La migración histórica `1792627200000-dropbox-storage.ts` se conserva para no alterar el historial de las bases existentes. Las columnas antiguas de fotos de perfil se mantienen ocultas y sin uso para evitar pérdida de datos al sincronizar. Los endpoints de fotos de perfil fueron retirados; los adjuntos de mensajes se guardan localmente y no dependen de Dropbox. Los archivos de perfil ya guardados en la nube no se eliminan con este cambio. Se ejecuta al iniciar con `DB_SYNCHRONIZE=false`, siguiendo el mecanismo actual del proyecto. En desarrollo, TypeORM sincroniza las entidades.

Después de conectar: subir fotos a una propiedad, recargar la galería y eliminar una fotografía. Comprobar las carpetas en Dropbox. Las pruebas automatizadas usan respuestas simuladas; no sustituyen esta comprobación con la cuenta real. Sin credenciales, los intentos de subir devuelven un error de servicio y no guardan archivos locales como alternativa.

Referencias: https://docs.dropboxapi.com/dropbox-api/docs/oauth y https://docs.dropboxapi.com/dropbox-api/api-reference/user-endpoints/files/upload

## Fotos existentes sin enlace después de agregar columnas

Si se agregaron las columnas `storage` y `url` a una base con rutas de Dropbox ya guardadas, algunos registros pueden quedar con `storage=local` y `url=NULL`. El frontend necesita el enlace compartido, además de la ruta interna. Actualizar ambos proyectos para que las respuestas públicas, reservas y guardadas incluyan `url`, y las vistas la utilicen.

Para una propiedad concreta, después de compilar ejecutar `npm run dropbox:repair-files -- --property-id=39` para revisar los registros y añadir `--apply` para corregirlos. El comando verifica los archivos en Dropbox, recupera únicamente enlaces compartidos existentes (requiere `sharing.read`) y actualiza sus metadatos en una transacción. No sube archivos ni crea enlaces públicos. Cambiar `39` por el identificador correspondiente. Si no hay enlace existente, la transacción se revierte.
