-- Citas para visitar propiedades y disponibilidad semanal del propietario.
-- En desarrollo (DB_SYNCHRONIZE distinto de 'false') TypeORM crea las tablas solo; en producción las crea la
-- migración Visits1792800000000. Este archivo es para aplicarlo a mano en una base ya existente.
-- Puede ejecutarse más de una vez.
BEGIN;

CREATE TABLE IF NOT EXISTS property_availability (
  id SERIAL PRIMARY KEY,
  "propertyId" integer NOT NULL,
  timezone varchar(64) NOT NULL,
  rules jsonb NOT NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_property_availability_property UNIQUE ("propertyId"),
  CONSTRAINT fk_property_availability_property FOREIGN KEY ("propertyId") REFERENCES property(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS visit (
  id SERIAL PRIMARY KEY,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "scheduledAt" timestamptz NOT NULL,
  "previousScheduledAt" timestamptz NULL,
  status varchar(20) NOT NULL DEFAULT 'PENDING',
  note varchar(500) NULL,
  "cancelReason" varchar(500) NULL,
  "cancelledBy" varchar(10) NULL,
  timezone varchar(64) NOT NULL,
  "expiresAt" timestamptz NULL,
  "confirmedAt" timestamptz NULL,
  "ownerNotifiedAt" timestamptz NULL,
  "propertyId" integer NOT NULL,
  "tenantId" integer NOT NULL,
  "ownerId" integer NOT NULL,
  CONSTRAINT fk_visit_property FOREIGN KEY ("propertyId") REFERENCES property(id) ON DELETE CASCADE,
  CONSTRAINT fk_visit_tenant FOREIGN KEY ("tenantId") REFERENCES "user"(id) ON DELETE CASCADE,
  CONSTRAINT fk_visit_owner FOREIGN KEY ("ownerId") REFERENCES "user"(id) ON DELETE CASCADE
);

-- Para una base que ya tenía la tabla (fase 1): hora del último aviso por correo al propietario.
ALTER TABLE visit ADD COLUMN IF NOT EXISTS "ownerNotifiedAt" timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_visit_owner_status ON visit ("ownerId", status);
CREATE INDEX IF NOT EXISTS idx_visit_tenant_status ON visit ("tenantId", status);
-- Un horario solo puede estar retenido por una cita a la vez: el primero que lo pide lo conserva.
CREATE UNIQUE INDEX IF NOT EXISTS uq_visit_active_slot ON visit ("propertyId", "scheduledAt")
  WHERE status IN ('PENDING', 'COUNTER_PROPOSED', 'CONFIRMED');
-- Un propietario tampoco puede tener dos citas confirmadas a la misma hora.
CREATE UNIQUE INDEX IF NOT EXISTS uq_visit_owner_confirmed_slot ON visit ("ownerId", "scheduledAt")
  WHERE status = 'CONFIRMED';

COMMIT;
