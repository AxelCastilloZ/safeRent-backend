import { EXPIRING_STATUSES, VisitStatus } from './visit-status.enum';
import type { Visit } from './entities/visit.entity';

/** Estado que ve el usuario: una solicitud sin respuesta a tiempo se muestra como vencida aunque nadie la haya actualizado. */
export function effectiveStatus(visit: Pick<Visit, 'status' | 'expiresAt'>, now = new Date()): VisitStatus {
  const waiting = (EXPIRING_STATUSES as readonly VisitStatus[]).includes(visit.status);
  return waiting && visit.expiresAt && visit.expiresAt.getTime() <= now.getTime() ? VisitStatus.EXPIRED : visit.status;
}

/** Estados en los que la cita sigue "viva": solo estas aparecen primero en las listas. */
export function isLive(visit: Pick<Visit, 'status' | 'expiresAt' | 'scheduledAt'>, now = new Date()): boolean {
  const status = effectiveStatus(visit, now);
  if (status === VisitStatus.CONFIRMED) return visit.scheduledAt.getTime() > now.getTime();
  return status === VisitStatus.PENDING || status === VisitStatus.COUNTER_PROPOSED;
}

/** Lo que se devuelve de una cita: solo datos necesarios, sin correo, teléfono ni cédula de nadie. */
export function toVisitView(visit: Visit, now = new Date()) {
  const { property, tenant, owner } = visit;
  return {
    id: visit.id,
    status: effectiveStatus(visit, now),
    scheduledAt: visit.scheduledAt,
    previousScheduledAt: visit.previousScheduledAt ?? null,
    timezone: visit.timezone,
    note: visit.note ?? null,
    cancelReason: visit.cancelReason ?? null,
    cancelledBy: visit.cancelledBy ?? null,
    createdAt: visit.createdAt,
    expiresAt: visit.expiresAt ?? null,
    confirmedAt: visit.confirmedAt ?? null,
    property: {
      id: property.id,
      title: property.title,
      address: property.address,
      status: property.status,
      reserved: Boolean(property.reservedTenantId),
      reservedForTenant: Boolean(property.reservedTenantId) && property.reservedTenantId === visit.tenantId,
    },
    tenant: { id: tenant.id, name: tenant.name, surname1: tenant.surname1, surname2: tenant.surname2 ?? null },
    owner: { id: owner.id, name: owner.name, surname1: owner.surname1 },
  };
}

export type VisitView = ReturnType<typeof toVisitView>;
