# Reserva desde la conversación

El propietario de la propiedad ve «Alquilar a esta persona» en la cabecera del chat.
POST /reservations/conversation/:conversationId requiere sesión con rol OWNER y comprueba
que el usuario sea el propietario y participante de ese chat. El inquilino se obtiene de
los participantes; no se acepta un ID de usuario enviado por el navegador.

Solo se reserva una propiedad ACTIVE con un único inquilino activo. La transacción bloquea
la fila de la propiedad: otra conversación no puede sustituir la reserva. Repetir la misma
operación conserva su fecha y relación.

La relación property.reservedTenant referencia user mediante reservedTenantId. Se guardan
reservedAt y reservedTenantName (nombre mostrado al reservar). No se publica correo,
cédula, teléfono ni otros datos personales del inquilino.

El estado de revisión sigue siendo ACTIVE: la reserva es independiente. La propiedad
permanece en el catálogo y muestra «Reservado por [nombre]» en tarjeta, detalle y chat.
No se incorporaron calendarios, confirmaciones del cliente, cancelaciones ni comentarios.

Backend: módulo reservation, controlador y servicio separados. Frontend: módulo Reservations
con modelo, servicio, hook y componentes Tailwind. El chat se refresca después de reservar
y periódicamente para mostrar el resultado a la otra cuenta.

El proyecto actualmente usa synchronize: true. Para aplicar el cambio sin arrancar Nest
se puede ejecutar docs/reservation-schema.sql contra la base configurada. Solo añade las
tres columnas y su clave foránea; no reserva propiedades existentes.
