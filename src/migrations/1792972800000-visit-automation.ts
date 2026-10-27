import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Automatización de citas: recordatorio enviado y confirmación automática por propiedad. */
export class VisitAutomation1792972800000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "visit" ADD COLUMN IF NOT EXISTS "reminderSentAt" timestamptz NULL`);
    await queryRunner.query(`ALTER TABLE "property_availability" ADD COLUMN IF NOT EXISTS "autoConfirm" boolean NOT NULL DEFAULT false`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "property_availability" DROP COLUMN IF EXISTS "autoConfirm"`);
    await queryRunner.query(`ALTER TABLE "visit" DROP COLUMN IF EXISTS "reminderSentAt"`);
  }
}
