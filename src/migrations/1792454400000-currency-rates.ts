import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Also used by development bootstrap, where automatic migrations are disabled. */
export class CurrencyRates1792454400000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS exchange_rate_batches (
      id SERIAL PRIMARY KEY,
      provider varchar(40) NOT NULL DEFAULT 'currencyapi.net',
      "baseCurrency" varchar(3) NOT NULL DEFAULT 'USD'
        CHECK ("baseCurrency" = 'USD'),
      "providerUpdatedAt" timestamptz NOT NULL,
      "fetchedAt" timestamptz NOT NULL DEFAULT now(),
      "isActive" boolean NOT NULL DEFAULT false
    )`);
    // At most one complete snapshot is used by all conversions.
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS exchange_rate_batches_one_active
      ON exchange_rate_batches ("isActive") WHERE "isActive" = true`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS exchange_rate_batches_provider_update
      ON exchange_rate_batches (provider, "baseCurrency", "providerUpdatedAt")`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS exchange_rates (
      "batchId" integer NOT NULL REFERENCES exchange_rate_batches(id) ON DELETE CASCADE,
      "currencyCode" varchar(3) NOT NULL CHECK ("currencyCode" ~ '^[A-Z]{3}$'),
      rate numeric(30,15) NOT NULL CHECK (rate > 0 AND rate < 'Infinity'::numeric),
      PRIMARY KEY ("batchId", "currencyCode"),
      CHECK ("currencyCode" <> 'USD' OR rate = 1)
    )`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS currency_sync_runs (
      id SERIAL PRIMARY KEY,
      "startedAt" timestamptz NOT NULL DEFAULT now(),
      "finishedAt" timestamptz NULL,
      status varchar(12) NOT NULL DEFAULT 'running'
        CHECK (status IN ('running', 'succeeded', 'failed', 'skipped')),
      "batchId" integer NULL REFERENCES exchange_rate_batches(id) ON DELETE SET NULL,
      "errorCode" varchar(80) NULL,
      CHECK ("finishedAt" IS NULL OR "finishedAt" >= "startedAt"),
      CHECK ((status = 'running' AND "finishedAt" IS NULL)
        OR (status <> 'running' AND "finishedAt" IS NOT NULL))
    )`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE currency_sync_runs');
    await queryRunner.query('DROP TABLE exchange_rates');
    await queryRunner.query('DROP TABLE exchange_rate_batches');
  }
}
