-- Ejecutar en la base de datos PostgreSQL utilizada por el backend de SafeRent.
-- Equivale a la migracion 1792627200000-dropbox-storage.ts.
-- Puede ejecutarse mas de una vez. Conserva las tablas y los datos existentes.
BEGIN;

ALTER TABLE "property_file"
  ADD COLUMN IF NOT EXISTS "storage" varchar(20) NOT NULL DEFAULT 'local',
  ADD COLUMN IF NOT EXISTS "url" text NULL;

ALTER TABLE "message_file"
  ADD COLUMN IF NOT EXISTS "storage" varchar(20) NOT NULL DEFAULT 'local';

ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS "profilePhotoPath" varchar(500) NULL,
  ADD COLUMN IF NOT EXISTS "profilePhotoUrl" text NULL;

COMMIT;

-- Debe devolver las cinco columnas configuradas para Dropbox.
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = current_schema()
  AND (
    (table_name = 'property_file' AND column_name IN ('storage', 'url'))
    OR (table_name = 'message_file' AND column_name = 'storage')
    OR (table_name = 'user' AND column_name IN ('profilePhotoPath', 'profilePhotoUrl'))
  )
ORDER BY table_name, column_name;
