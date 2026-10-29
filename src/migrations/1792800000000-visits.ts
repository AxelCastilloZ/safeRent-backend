import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Citas para visitar propiedades y la disponibilidad semanal del propietario. */
export class Visits1792800000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "property_availability" (
      "id" SERIAL PRIMARY KEY,
      "propertyId" integer NOT NULL,
      "timezone" varchar(64) NOT NULL,
      "rules" jsonb NOT NULL,
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "uq_property_availability_property" UNIQUE ("propertyId"),
      CONSTRAINT "fk_property_availability_property" FOREIGN KEY ("propertyId") REFERENCES "property"("id") ON DELETE CASCADE)`);

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "visit" (
      "id" SERIAL PRIMARY KEY,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      "scheduledAt" timestamptz NOT NULL,
      "previousScheduledAt" timestamptz NULL,
      "status" varchar(20) NOT NULL DEFAULT 'PENDING',
      "note" varchar(500) NULL,
      "cancelReason" varchar(500) NULL,
      "cancelledBy" varchar(10) NULL,
      "timezone" varchar(64) NOT NULL,
      "expiresAt" timestamptz NULL,
      "confirmedAt" timestamptz NULL,
      "propertyId" integer NOT NULL,
      "tenantId" integer NOT NULL,
      "ownerId" integer NOT NULL,
      CONSTRAINT "fk_visit_property" FOREIGN KEY ("propertyId") REFERENCES "property"("id") ON DELETE CASCADE,
      CONSTRAINT "fk_visit_tenant" FOREIGN KEY ("tenantId") REFERENCES "user"("id") ON DELETE CASCADE,
      CONSTRAINT "fk_visit_owner" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE)`);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_visit_owner_status" ON "visit" ("ownerId", "status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_visit_tenant_status" ON "visit" ("tenantId", "status")`);
    // Un horario solo puede estar retenido por una cita a la vez: el primero que lo pide lo conserva.
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "uq_visit_active_slot" ON "visit" ("propertyId", "scheduledAt")
      WHERE "status" IN ('PENDING', 'COUNTER_PROPOSED', 'CONFIRMED')`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "uq_visit_owner_confirmed_slot" ON "visit" ("ownerId", "scheduledAt")
      WHERE "status" = 'CONFIRMED'`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "visit"');
    await queryRunner.query('DROP TABLE IF EXISTS "property_availability"');
  }
}
