export enum PropertyStatus {
    /** El propietario todavía está completando el formulario (datos, ubicación, imágenes). No se muestra al administrador. */
    DRAFT = 'DRAFT',
    /** El propietario envió la propiedad y está esperando que un administrador la revise. */
    PENDING = 'PENDING',
    /** El administrador aprobó la propiedad: es visible públicamente. */
    ACTIVE = 'ACTIVE',
    /** El administrador encontró algo que corregir; el propietario debe editar y volver a enviarla. */
    CHANGES_REQUESTED = 'CHANGES_REQUESTED',
    /** El administrador rechazó la propiedad o la desactivó; no es visible públicamente. */
    INACTIVE = 'INACTIVE',
}

/** Estados que un administrador puede asignar al revisar una propiedad enviada. */
export const REVIEWABLE_PROPERTY_STATUSES = [
    PropertyStatus.ACTIVE,
    PropertyStatus.CHANGES_REQUESTED,
    PropertyStatus.INACTIVE,
] as const;
