import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ProfileCurrency1792454400002 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user"
      ADD COLUMN IF NOT EXISTS "countryCode" varchar(2) NULL,
      ADD COLUMN IF NOT EXISTS "preferredCurrency" varchar(3) NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user"
      DROP COLUMN IF EXISTS "preferredCurrency",
      DROP COLUMN IF EXISTS "countryCode"`);
  }
}
