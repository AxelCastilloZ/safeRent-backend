export enum VisitStatus {
  /** El inquilino pidió el horario y el propietario todavía no responde. El horario queda retenido. */
  PENDING = 'PENDING',
  /** El propietario propuso otro horario y espera la respuesta del inquilino. */
  COUNTER_PROPOSED = 'COUNTER_PROPOSED',
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
  /** Nadie respondió a tiempo: el horario se liberó. */
  EXPIRED = 'EXPIRED',
}

/** Estados que mantienen ocupado un horario (los usa también el índice único parcial de la tabla). */
export const HOLDING_STATUSES = [VisitStatus.PENDING, VisitStatus.COUNTER_PROPOSED, VisitStatus.CONFIRMED] as const;
/** Estados que esperan una respuesta y por eso vencen. */
export const EXPIRING_STATUSES = [VisitStatus.PENDING, VisitStatus.COUNTER_PROPOSED] as const;
