/** Duración fija de cada cita. */
export const SLOT_MINUTES = 30;
/** Anticipación mínima para pedir una cita (no se puede agendar "para ya"). */
export const MIN_LEAD_MINUTES = 60;
/** Hasta cuántos días hacia adelante se puede agendar. */
export const MAX_DAYS_AHEAD = 60;
/** Máximo de días que se pueden consultar de una vez en el calendario. */
export const MAX_RANGE_DAYS = 62;
/** Cuánto espera una solicitud (o una contrapropuesta) una respuesta antes de vencer y liberar el horario. */
export const HOLD_HOURS = 48;
/** Cada cuánto se revisan las solicitudes que nadie respondió a tiempo. */
export const EXPIRY_JOB_MS = 10 * 60_000;
/** Cada cuánto se revisan las citas próximas para mandar el recordatorio. */
export const REMINDER_JOB_MS = 30 * 60_000;
/** Con cuántas horas de anticipación se recuerda una cita confirmada. */
export const REMINDER_BEFORE_HOURS = 24;
/** No se recuerda una cita que se acaba de confirmar: el correo de confirmación ya es el aviso. */
export const REMINDER_MIN_CONFIRMED_HOURS = 3;
/** Cada cuántas horas, como máximo, se le recuerda por correo al propietario que tiene solicitudes sin responder. */
export const OWNER_REMINDER_HOURS = 12;
/** Solicitudes pendientes que puede tener una propiedad a la vez: protege al propietario de quedar desbordado. */
export const MAX_PENDING_PER_PROPERTY = 5;
