import { MigrationInterface, QueryRunner } from 'typeorm';

/** Vistas de las propiedades: una fila por persona distinta (código anónimo del navegador) y propiedad. */
export class PropertyViews1793318400000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "property_view" (
      "id" SERIAL PRIMARY KEY,
      "propertyId" integer NOT NULL,
      "visitorId" varchar(64) NOT NULL,
      "firstViewedAt" timestamptz NOT NULL DEFAULT now(),
      "lastViewedAt" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "uq_property_view_visitor" UNIQUE ("propertyId", "visitorId"),
      CONSTRAINT "fk_property_view_property" FOREIGN KEY ("propertyId") REFERENCES "property"("id") ON DELETE CASCADE)`);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "idx_property_view_property" ON "property_view" ("propertyId")');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "property_view"');
  }
}
