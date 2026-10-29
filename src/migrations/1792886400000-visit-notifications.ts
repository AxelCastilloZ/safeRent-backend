import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Hora del último aviso por correo al propietario de cada solicitud de cita (para no repetir correos). */
export class VisitNotifications1792886400000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "visit" ADD COLUMN IF NOT EXISTS "ownerNotifiedAt" timestamptz NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "visit" DROP COLUMN IF EXISTS "ownerNotifiedAt"`);
  }
}
