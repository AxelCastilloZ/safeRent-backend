BEGIN;
ALTER TABLE property ADD COLUMN IF NOT EXISTS "reservedTenantId" integer;
ALTER TABLE property ADD COLUMN IF NOT EXISTS "reservedTenantName" varchar(350);
ALTER TABLE property ADD COLUMN IF NOT EXISTS "reservedAt" timestamptz;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'property'::regclass
      AND contype = 'f'
      AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'property'::regclass AND attname = 'reservedTenantId')]::smallint[]
  ) THEN
    ALTER TABLE property ADD CONSTRAINT property_reserved_tenant_fk
      FOREIGN KEY ("reservedTenantId") REFERENCES public."user"(id) ON DELETE RESTRICT;
  END IF;
END $$;
COMMIT;
