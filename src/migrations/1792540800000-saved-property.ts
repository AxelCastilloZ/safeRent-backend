import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Propiedades guardadas por los inquilinos: una fila por pareja usuario–propiedad. */
export class SavedProperty1792540800000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "saved_property" (
      "id" SERIAL PRIMARY KEY,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "userId" integer NOT NULL,
      "propertyId" integer NOT NULL,
      CONSTRAINT "uq_saved_property_user_property" UNIQUE ("userId", "propertyId"),
      CONSTRAINT "fk_saved_property_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE,
      CONSTRAINT "fk_saved_property_property" FOREIGN KEY ("propertyId") REFERENCES "property"("id") ON DELETE CASCADE)`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_saved_property_user_created" ON "saved_property" ("userId", "createdAt")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "saved_property"');
  }
}
