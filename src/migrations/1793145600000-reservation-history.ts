import { MigrationInterface, QueryRunner } from 'typeorm';

/** Historial de reservas. Copia las reservas vigentes para no empezar el historial vacío. */
export class ReservationHistory1793145600000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "reservation" (
      "id" SERIAL PRIMARY KEY,
      "startedAt" timestamptz NOT NULL,
      "endedAt" timestamptz NULL,
      "endReason" varchar(500) NULL,
      "propertyId" integer NOT NULL,
      "tenantId" integer NOT NULL,
      "ownerId" integer NOT NULL,
      CONSTRAINT "fk_reservation_property" FOREIGN KEY ("propertyId") REFERENCES "property"("id") ON DELETE CASCADE,
      CONSTRAINT "fk_reservation_tenant" FOREIGN KEY ("tenantId") REFERENCES "user"("id") ON DELETE CASCADE,
      CONSTRAINT "fk_reservation_owner" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE)`);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "idx_reservation_property" ON "reservation" ("propertyId")');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "idx_reservation_tenant" ON "reservation" ("tenantId")');
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "uq_reservation_active_property" ON "reservation" ("propertyId") WHERE "endedAt" IS NULL',
    );
    await queryRunner.query(`INSERT INTO "reservation" ("startedAt", "propertyId", "tenantId", "ownerId")
      SELECT COALESCE(p."reservedAt", now()), p."id", p."reservedTenantId", p."ownerId"
      FROM "property" p
      WHERE p."reservedTenantId" IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM "reservation" r WHERE r."propertyId" = p."id" AND r."endedAt" IS NULL)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "reservation"');
  }
}
