BEGIN;
ALTER TABLE property_comment ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;
ALTER TABLE property_comment ADD COLUMN IF NOT EXISTS "moderationNote" varchar(500);
ALTER TABLE property_comment ADD COLUMN IF NOT EXISTS "moderatedAt" timestamptz;
ALTER TABLE property_comment ADD COLUMN IF NOT EXISTS "moderatedById" integer;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='property_comment'::regclass AND conname='fk_comment_moderator') THEN
    ALTER TABLE property_comment ADD CONSTRAINT fk_comment_moderator FOREIGN KEY ("moderatedById") REFERENCES public."user"(id) ON DELETE RESTRICT;
  END IF;
END $$;
COMMIT;
