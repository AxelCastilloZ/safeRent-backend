-- Estado leído / sin leer de los mensajes.
-- En desarrollo (DB_SYNCHRONIZE distinto de 'false') TypeORM crea la columna sola; en producción la agrega la
-- migración MessageReadAt1791417600000. Este archivo es para aplicarlo a mano en una base ya existente.
-- Ejecútalo UNA SOLA VEZ, justo al agregar la columna: marca como leídos los mensajes anteriores a esta función.
BEGIN;
ALTER TABLE message ADD COLUMN IF NOT EXISTS "readAt" timestamp NULL;
UPDATE message SET "readAt" = "createdAt" WHERE "readAt" IS NULL;
COMMIT;
