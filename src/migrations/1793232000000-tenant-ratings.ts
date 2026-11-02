import { MigrationInterface, QueryRunner } from 'typeorm';

/** Calificaciones de inquilinos por parte de los propietarios (una por reserva). */
export class TenantRatings1793232000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "tenant_rating" (
      "id" SERIAL PRIMARY KEY,
      "rating" smallint NOT NULL,
      "comment" varchar(500) NULL,
      "reservationId" integer NOT NULL,
      "tenantId" integer NOT NULL,
      "ownerId" integer NOT NULL,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "uq_tenant_rating_reservation" UNIQUE ("reservationId"),
      CONSTRAINT "ck_tenant_rating_rating" CHECK ("rating" BETWEEN 1 AND 5),
      CONSTRAINT "fk_tenant_rating_reservation" FOREIGN KEY ("reservationId") REFERENCES "reservation"("id") ON DELETE CASCADE,
      CONSTRAINT "fk_tenant_rating_tenant" FOREIGN KEY ("tenantId") REFERENCES "user"("id") ON DELETE CASCADE,
      CONSTRAINT "fk_tenant_rating_owner" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE)`);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "idx_tenant_rating_tenant" ON "tenant_rating" ("tenantId")');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "tenant_rating"');
  }
}
