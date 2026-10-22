import type { MigrationInterface, QueryRunner } from 'typeorm';
import { seedCatalogCodes } from '../common/catalog-seeds';

export class CatalogI18n1792713600000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['service', 'type_of_property']) {
      await queryRunner.query(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "catalogCode" varchar(64) NULL,
        ADD COLUMN IF NOT EXISTS "translations" jsonb NULL`);
      await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_${table}_catalogCode" ON "${table}" ("catalogCode")`);
    }
    await seedCatalogCodes(queryRunner);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['service', 'type_of_property']) {
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "catalogCode", DROP COLUMN IF EXISTS "translations"`);
    }
  }
}
