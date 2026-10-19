import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Estado leído/sin leer de los mensajes: agrega `message.readAt` (vacío = sin leer). */
export class MessageReadAt1791417600000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    const alreadyThere = await queryRunner.hasColumn('message', 'readAt');
    await queryRunner.query(`ALTER TABLE "message" ADD COLUMN IF NOT EXISTS "readAt" timestamp NULL`);
    // Solo la primera vez: los mensajes anteriores a esta función se consideran leídos
    // (si no, todo el historial aparecería como sin leer).
    if (!alreadyThere) {
      await queryRunner.query(`UPDATE "message" SET "readAt" = "createdAt" WHERE "readAt" IS NULL`);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "message" DROP COLUMN IF EXISTS "readAt"`);
  }
}
