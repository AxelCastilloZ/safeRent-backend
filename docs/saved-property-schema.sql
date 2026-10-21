-- Propiedades guardadas por los inquilinos.
-- En desarrollo (DB_SYNCHRONIZE distinto de 'false') TypeORM crea la tabla solo; en producción la crea la
-- migración SavedProperty1792540800000. Este archivo es para aplicarlo a mano en una base ya existente.
BEGIN;
CREATE TABLE IF NOT EXISTS saved_property (
  id SERIAL PRIMARY KEY,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "userId" integer NOT NULL,
  "propertyId" integer NOT NULL,
  CONSTRAINT uq_saved_property_user_property UNIQUE ("userId", "propertyId"),
  CONSTRAINT fk_saved_property_user FOREIGN KEY ("userId") REFERENCES "user"(id) ON DELETE CASCADE,
  CONSTRAINT fk_saved_property_property FOREIGN KEY ("propertyId") REFERENCES property(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_saved_property_user_created ON saved_property ("userId", "createdAt");
COMMIT;
