import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ProfileLanguage1792627200000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "preferredLanguage" varchar(2) NULL`);
    await queryRunner.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CHK_user_language' AND conrelid = '"user"'::regclass) THEN
        ALTER TABLE "user" ADD CONSTRAINT "CHK_user_language" CHECK ("preferredLanguage" IS NULL OR "preferredLanguage" IN ('es', 'en', 'fr', 'pt'));
      END IF;
    END $$`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" DROP CONSTRAINT IF EXISTS "CHK_user_language"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN IF EXISTS "preferredLanguage"`);
  }
}
