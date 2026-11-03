import { MigrationInterface, QueryRunner } from 'typeorm';

/** Encuesta del inquilino al terminar su estadía (servicios y entorno), una por reserva. */
export class StaySurveys1793404800000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "stay_survey" (
      "id" SERIAL PRIMARY KEY,
      "waterStability" smallint NOT NULL,
      "electricityStability" smallint NOT NULL,
      "internetMbps" integer NOT NULL,
      "universityKm" numeric(5,1) NULL,
      "coworkingKm" numeric(5,1) NULL,
      "hasWorkArea" boolean NOT NULL DEFAULT false,
      "reservationId" integer NOT NULL,
      "propertyId" integer NOT NULL,
      "tenantId" integer NOT NULL,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "uq_stay_survey_reservation" UNIQUE ("reservationId"),
      CONSTRAINT "ck_stay_survey_water" CHECK ("waterStability" BETWEEN 1 AND 5),
      CONSTRAINT "ck_stay_survey_electricity" CHECK ("electricityStability" BETWEEN 1 AND 5),
      CONSTRAINT "fk_stay_survey_reservation" FOREIGN KEY ("reservationId") REFERENCES "reservation"("id") ON DELETE CASCADE,
      CONSTRAINT "fk_stay_survey_property" FOREIGN KEY ("propertyId") REFERENCES "property"("id") ON DELETE CASCADE,
      CONSTRAINT "fk_stay_survey_tenant" FOREIGN KEY ("tenantId") REFERENCES "user"("id") ON DELETE CASCADE)`);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "idx_stay_survey_property" ON "stay_survey" ("propertyId")');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "stay_survey"');
  }
}
