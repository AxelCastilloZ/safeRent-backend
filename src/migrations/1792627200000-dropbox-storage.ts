import type { MigrationInterface, QueryRunner } from 'typeorm';

export class DropboxStorage1792627200000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "property_file"
      ADD COLUMN IF NOT EXISTS "storage" varchar(20) NOT NULL DEFAULT 'local',
      ADD COLUMN IF NOT EXISTS "url" text NULL`);
    await queryRunner.query(
      `ALTER TABLE "message_file" ADD COLUMN IF NOT EXISTS "storage" varchar(20) NOT NULL DEFAULT 'local'`,
    );
    await queryRunner.query(`ALTER TABLE "user"
      ADD COLUMN IF NOT EXISTS "profilePhotoPath" varchar(500) NULL,
      ADD COLUMN IF NOT EXISTS "profilePhotoUrl" text NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "property_file" DROP COLUMN IF EXISTS "storage", DROP COLUMN IF EXISTS "url"`,
    );
    await queryRunner.query(
      `ALTER TABLE "message_file" DROP COLUMN IF EXISTS "storage"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN IF EXISTS "profilePhotoPath", DROP COLUMN IF EXISTS "profilePhotoUrl"`,
    );
  }
}
