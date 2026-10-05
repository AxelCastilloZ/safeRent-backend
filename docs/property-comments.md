# Comentarios del inquilino

En el detalle público de la propiedad se muestran los comentarios y, únicamente para el
inquilino vinculado mediante reservedTenantId, un formulario para publicar su experiencia.
Cada inquilino puede publicar un comentario por propiedad. El texto se recorta y tiene
un máximo de 1000 caracteres. No se incorporaron puntuaciones ni edición.

GET /comments/property/:propertyId es público y lista los comentarios de una propiedad
activa, con ID, contenido, fecha y solo ID y nombre del autor.

POST /comments/property/:propertyId requiere sesión. Recibe { content } y toma el autor
del token. El backend verifica que reservedTenantId coincida con ese usuario y que no
sea el propietario. No basta con mostrar el formulario en el frontend.

La tabla property_comment relaciona cada comentario con property y user. Una restricción
única impide duplicados; la transacción bloquea la propiedad al comprobar la reserva.

Backend: módulo comment con entidad, DTO, controlador y servicio.
Frontend: módulo Comments con modelo, servicio, hooks y componente Tailwind.
Se reemplazó el texto provisional de reseñas en PublicPropertyPage.

El proyecto utiliza synchronize: true; la tabla también puede prepararse con
docs/comment-schema.sql, que no modifica propiedades ni reservas existentes.

Administración: /dashboard/admin/comments permite buscar y filtrar, ocultar con un motivo
obligatorio de hasta 500 caracteres y restaurar. GET /comments/admin y
PATCH /comments/:id/moderation requieren ADMIN. Se registran administrador y fecha.
Los ocultos no aparecen en el listado público; GET /comments/property/:propertyId/me
permite a cada autor comprobar si ya comentó, incluso si administración lo ocultó.
La preparación manual adicional está en docs/comment-moderation-schema.sql.

Prueba manual: entra como el inquilino vinculado, abre la propiedad y publica. Recarga
para comprobar que persiste. Otra cuenta y el propietario pueden leer, pero no publicar.
